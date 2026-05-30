"""
gRPC Server — Receives telemetry streams from VOIGHT Agents.
Runs alongside the FastAPI server on a separate port.
"""

import asyncio
import logging
from concurrent import futures
from datetime import datetime, timezone

import grpc

from app.core.config import settings
from app.core.database import async_session_factory
from app.services.telemetry import TelemetryService, IncidentService
from app.services.competition import ContestantService
from app.scoring.engine import scoring_engine

from voight import telemetry_pb2, enrollment_pb2

logger = logging.getLogger(__name__)


class TelemetryServicer:
    """
    gRPC Telemetry Service implementation.

    Handles:
    - StreamTelemetry: Bidirectional streaming of telemetry data
    - Heartbeat: Single heartbeat check-in
    """

    async def StreamTelemetry(self, request_iterator, context):
        """
        Receive a stream of telemetry reports from an agent.
        Process each report and create incidents as needed.
        """
        events_received = 0

        async for report in request_iterator:
            events_received += 1
            if not report.contestant_id:
                continue

            try:
                import uuid
                contestant_id = uuid.UUID(report.contestant_id)
            except ValueError:
                continue

            try:
                async with async_session_factory() as db:
                    # Route to appropriate handler based on payload type
                    payload_type = report.WhichOneof("payload")

                    if payload_type == "process_snapshot":
                        await self._handle_process_snapshot(
                            db, contestant_id, report.process_snapshot
                        )
                    elif payload_type == "network_event":
                        await self._handle_network_event(
                            db, contestant_id, report.network_event
                        )
                    elif payload_type == "resource_snapshot":
                        await self._handle_resource_snapshot(
                            db, contestant_id, report.resource_snapshot
                        )
                    elif payload_type == "file_alert":
                        await self._handle_file_alert(
                            db, contestant_id, report.file_alert
                        )
                    elif payload_type == "ebpf_alert":
                        await self._handle_ebpf_alert(
                            db, contestant_id, report.ebpf_alert
                        )
                    elif payload_type == "memory_finding":
                        await self._handle_memory_finding(
                            db, contestant_id, report.memory_finding
                        )

            except Exception as e:
                logger.error(f"Error processing telemetry: {e}")

        # Return acknowledgment
        return telemetry_pb2.TelemetryAck(success=True, events_received=events_received)

    async def Heartbeat(self, request, context):
        """Process a heartbeat from an agent."""
        try:
            import uuid
            contestant_id = uuid.UUID(request.contestant_id)
        except ValueError:
            return telemetry_pb2.HeartbeatResponse(acknowledged=False)

        try:
            async with async_session_factory() as db:
                # Record heartbeat
                await TelemetryService.ingest_heartbeat(
                    db,
                    contestant_id=contestant_id,
                    agent_version=request.agent_version,
                    agent_hash=request.agent_binary_hash,
                )

                # Update contestant status
                await ContestantService.update_heartbeat(
                    db, contestant_id, request.agent_version
                )
                
                # Periodically recalculate score to apply time decay for OPEN incidents
                await IncidentService.recalculate_score(db, contestant_id)
                
                # Consume any pending warning payload
                deploy_warning = TelemetryService.consume_warning(contestant_id)
                
                # Send dynamic policy to agent
                from sqlalchemy import select
                from app.models import SystemPolicy
                result = await db.execute(select(SystemPolicy).where(SystemPolicy.id == 1))
                policy = result.scalars().first()
                
                config_update = None
                if policy:
                    scoring_engine.update_dynamic_policy(policy)
                    config_update = telemetry_pb2.AgentConfig(
                        process_scan_interval_seconds=5,
                        network_scan_interval_seconds=5,
                        resource_scan_interval_seconds=5,
                        additional_ai_domains=[d.get('domain') for d in policy.domains if d.get('domain')],
                        additional_ai_processes=[p.get('name') for p in policy.processes if p.get('name')]
                    )

            return telemetry_pb2.HeartbeatResponse(
                acknowledged=True,
                heartbeat_interval_seconds=settings.AGENT_HEARTBEAT_INTERVAL_SECONDS,
                deploy_warning_payload=deploy_warning,
                config_update=config_update,
            )

        except Exception as e:
            logger.error(f"Heartbeat error: {e}")
            return telemetry_pb2.HeartbeatResponse(acknowledged=False)

    async def RequestHelp(self, request, context):
        """Handle a help request from the contestant's GUI."""
        try:
            import uuid
            contestant_id = uuid.UUID(request.contestant_id)
            async with async_session_factory() as db:
                await IncidentService.create_incident(
                    db,
                    contestant_id,
                    ioa_type="HELP_REQUEST",
                    severity="INFO",
                    details=f"Contestant requested help via Agent GUI",
                    raw_data={}
                )
            logger.info(f"Help request received from contestant {contestant_id}")
            return telemetry_pb2.HelpResponse(
                acknowledged=True,
                message="Help request sent to Proctor."
            )
        except Exception as e:
            logger.error(f"RequestHelp error: {e}")
            return telemetry_pb2.HelpResponse(acknowledged=False)

    async def Disconnect(self, request, context):
        """Handle intentional disconnect from the contestant's GUI."""
        try:
            import uuid
            contestant_id = uuid.UUID(request.contestant_id)
            async with async_session_factory() as db:
                await IncidentService.create_incident(
                    db,
                    contestant_id,
                    ioa_type="INTENTIONAL_DISCONNECT",
                    severity="CRITICAL",
                    details=f"Contestant intentionally disconnected the agent via GUI",
                    raw_data={}
                )
            logger.warning(f"Intentional disconnect received from contestant {contestant_id}")
            return telemetry_pb2.DisconnectResponse(acknowledged=True)
        except Exception as e:
            logger.error(f"Disconnect error: {e}")
            return telemetry_pb2.DisconnectResponse(acknowledged=False)

    async def _handle_process_snapshot(self, db, contestant_id, snapshot):
        """Process a process snapshot."""
        processes = []
        for proc in snapshot.processes:
            processes.append({
                "name": proc.name,
                "pid": proc.pid,
                "cmdline": proc.cmdline,
                "cpu_percent": proc.cpu_percent,
                "memory_mb": proc.memory_mb,
                "category": proc.category,
            })

        await TelemetryService.ingest_processes(db, contestant_id, processes)

        # Check for AI processes
        for proc in snapshot.processes:
            ioa_type = scoring_engine.classify_process(proc.category, process_name=proc.name)
            if ioa_type:
                await IncidentService.process_telemetry_and_score(
                    db, contestant_id, ioa_type,
                    evidence=f"Process: {proc.name} (PID: {proc.pid})",
                )

    async def _handle_network_event(self, db, contestant_id, event):
        """Process a network event."""
        await TelemetryService.ingest_network_event(db, contestant_id, {
            "dst_domain": event.dst_domain,
            "dst_ip": event.dst_ip,
            "dst_port": event.dst_port,
            "protocol": event.protocol,
            "verdict": event.verdict,
        })

        if event.dst_domain:
            ioa_type = scoring_engine.classify_network_event(event.dst_domain)
            if ioa_type:
                await IncidentService.process_telemetry_and_score(
                    db, contestant_id, ioa_type,
                    evidence=f"Connection: {event.dst_domain} ({event.dst_ip}:{event.dst_port})",
                )

    async def _handle_resource_snapshot(self, db, contestant_id, snapshot):
        """Process a resource usage snapshot."""
        await TelemetryService.ingest_resources(db, contestant_id, {
            "cpu_percent": snapshot.cpu_percent,
            "ram_percent": snapshot.ram_percent,
            "gpu_percent": snapshot.gpu_percent,
            "vram_mb": snapshot.vram_mb,
        })

        # Check for GPU anomalies (sustained high usage indicates LLM inference)
        if snapshot.gpu_percent > settings.RESOURCE_GPU_SPIKE_THRESHOLD:
            await IncidentService.process_telemetry_and_score(
                db, contestant_id, "GPU_SPIKE",
                evidence=f"GPU: {snapshot.gpu_percent:.1f}%",
            )

        # Check for VRAM anomalies (>4GB sustained = likely LLM model loaded)
        if snapshot.vram_mb > settings.RESOURCE_VRAM_SPIKE_THRESHOLD_MB:
            await IncidentService.process_telemetry_and_score(
                db, contestant_id, "VRAM_SPIKE",
                evidence=f"VRAM: {snapshot.vram_mb:.0f}MB (threshold: {settings.RESOURCE_VRAM_SPIKE_THRESHOLD_MB}MB)",
            )

    async def _handle_file_alert(self, db, contestant_id, alert):
        """Process a file detection alert."""
        await IncidentService.process_telemetry_and_score(
            db, contestant_id, "MODEL_FILE",
            evidence=f"File: {alert.file_name} ({alert.file_size_bytes / 1024 / 1024:.1f}MB, {alert.file_type})",
        )

    async def _handle_ebpf_alert(self, db, contestant_id, alert):
        """Process an eBPF kernel-level detection event.

        Routes events based on category:
        - AI process executions → EBPF_EXEC_AI
        - Model file access → EBPF_FILE_MODEL_ACCESS
        - Network connections are handled by the existing NetworkMonitor
        """
        ioa_type = None
        if alert.category in ("AI_EDITOR", "LOCAL_LLM", "AI_AGENT"):
            ioa_type = "EBPF_EXEC_AI"
        elif alert.category == "MODEL_FILE":
            ioa_type = "EBPF_FILE_MODEL_ACCESS"

        if ioa_type:
            await IncidentService.process_telemetry_and_score(
                db, contestant_id, ioa_type,
                evidence=(
                    f"eBPF {alert.event_type}: {alert.process_name} "
                    f"(PID: {alert.pid}, detail: {alert.detail})"
                ),
            )

    async def _handle_memory_finding(self, db, contestant_id, finding):
        """Process a memory forensics finding — AI model tensor detected in RAM.

        This is a high-confidence indicator: if a model tensor is loaded in memory,
        the contestant is actively running or has recently run an AI model.
        """
        region_size_mb = finding.region_size / (1024 * 1024)
        await IncidentService.process_telemetry_and_score(
            db, contestant_id, "MEMORY_MODEL_LOADED",
            evidence=(
                f"Memory: {finding.model_format} tensor in PID {finding.pid} "
                f"({finding.process_name}) at 0x{finding.region_addr:x} "
                f"(region: {region_size_mb:.0f}MB)"
            ),
        )


class EnrollmentServicer:
    """
    gRPC Enrollment Service implementation.
    """

    async def Enroll(self, request, context):
        """Process agent enrollment request."""
        try:
            peer = context.peer()
            # Extract IP from 'ipv4:192.168.1.5:12345' or 'ipv6:[::1]:12345'
            peer_ip = "Unknown"
            if peer.startswith("ipv4:"):
                peer_ip = peer.split("ipv4:")[1].split(":")[0]
            elif peer.startswith("ipv6:"):
                peer_ip = peer.split("ipv6:")[1].rsplit(":", 1)[0].strip("[]")
            
            fp_str = str(request.fingerprint)
            if "ip_address:" not in fp_str:
                fp_str += f'\nip_address: "{peer_ip}"'

            async with async_session_factory() as db:
                contestant = await ContestantService.enroll(
                    db,
                    token=request.enrollment_token,
                    agent_fingerprint=fp_str,
                    agent_version=request.agent_version,
                )

                if not contestant:
                    context.set_code(grpc.StatusCode.NOT_FOUND)
                    context.set_details("Invalid enrollment token")
                    return enrollment_pb2.EnrollmentResponse(success=False, message="Invalid token")

                return enrollment_pb2.EnrollmentResponse(
                    success=True,
                    agent_id=str(contestant.id),
                    contestant_id=str(contestant.id),
                    competition_id=str(contestant.competition_id),
                )

        except Exception as e:
            logger.error(f"Enrollment error: {e}")
            context.set_code(grpc.StatusCode.INTERNAL)
            return enrollment_pb2.EnrollmentResponse(success=False, message=str(e))

    async def CheckStatus(self, request, context):
        """Check if an agent is still enrolled and active."""
        try:
            async with async_session_factory() as db:
                contestant = await ContestantService.get_by_id(db, request.contestant_id)
                if not contestant:
                    return enrollment_pb2.StatusResponse(enrolled=False, active=False)

                return enrollment_pb2.StatusResponse(
                    enrolled=contestant.is_enrolled,
                    active=contestant.is_online,
                )
        except Exception as e:
            logger.error(f"Status check error: {e}")
            return enrollment_pb2.StatusResponse(enrolled=False, active=False)


async def serve_grpc():
    """Start the gRPC server with optional mTLS."""
    server = grpc.aio.server(futures.ThreadPoolExecutor(max_workers=settings.GRPC_MAX_WORKERS))

    # Register generated servicers here after protoc compilation:
    from voight import telemetry_pb2_grpc, enrollment_pb2_grpc
    telemetry_pb2_grpc.add_TelemetryServiceServicer_to_server(TelemetryServicer(), server)
    enrollment_pb2_grpc.add_EnrollmentServiceServicer_to_server(EnrollmentServicer(), server)

    if settings.GRPC_TLS_ENABLED:
        # ── mTLS: Mutual TLS with client certificate verification ──
        try:
            with open(settings.GRPC_CA_CERT_PATH, "rb") as f:
                ca_cert = f.read()
            with open(settings.GRPC_SERVER_KEY_PATH, "rb") as f:
                server_key = f.read()
            with open(settings.GRPC_SERVER_CERT_PATH, "rb") as f:
                server_cert = f.read()

            server_credentials = grpc.ssl_server_credentials(
                [(server_key, server_cert)],
                root_certificates=ca_cert,
                require_client_auth=True,  # mTLS: require agent client cert
            )
            server.add_secure_port(f"[::]:{settings.GRPC_PORT}", server_credentials)
            logger.info(f"[gRPC] mTLS ENABLED on port {settings.GRPC_PORT}")
        except FileNotFoundError as e:
            logger.error(f"[gRPC] FATAL: TLS certificate file not found: {e}")
            logger.error("[gRPC] Generate certificates with: deploy/certs/generate-ca.sh")
            raise
    else:
        # ── Development: Insecure transport ──
        server.add_insecure_port(f"[::]:{settings.GRPC_PORT}")
        logger.warning("[gRPC] Running WITHOUT TLS (development mode)")

    logger.info(f"[gRPC] Starting server on port {settings.GRPC_PORT}...")
    await server.start()
    logger.info(f"[gRPC] Server started ✓")
    
    try:
        await server.wait_for_termination()
    except asyncio.CancelledError:
        logger.info("[gRPC] Stopping server gracefully...")
        await server.stop(grace=None)

