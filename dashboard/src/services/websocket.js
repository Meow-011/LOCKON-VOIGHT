/**
 * WebSocket hook for real-time Proctor Dashboard updates.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_BASE = `${WS_PROTOCOL}//${window.location.host}/ws`;

export function useWebSocket(competitionId) {
  const wsRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [contestantUpdates, setContestantUpdates] = useState({});
  const [incidentAlerts, setIncidentAlerts] = useState([]);
  const reconnectTimeout = useRef(null);
  
  // High-performance Buffer for Throttled Updates
  const updateBuffer = useRef({
    contestants: {},
    incidents: [],
  });

  const connect = useCallback(() => {
    if (!competitionId) return;

    const token = localStorage.getItem('voight_access_token');
    const url = `${WS_BASE}/${competitionId}${token ? `?token=${token}` : ''}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      console.log('[WS] Connected to competition:', competitionId);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastMessage(data);

        // BUFFER updates instead of re-rendering immediately
        switch (data.type) {
          case 'contestant_update':
            updateBuffer.current.contestants[data.contestant_id] = { ...data.data, updatedAt: new Date() };
            break;

          case 'incident_alert':
            updateBuffer.current.incidents.push(data.incident);
            break;

          case 'pong':
            break;

          default:
            break;
        }
      } catch (e) {
        console.error('[WS] Parse error:', e);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log('[WS] Disconnected. Reconnecting in 3s...');
      reconnectTimeout.current = setTimeout(connect, 3000);
    };

    ws.onerror = (error) => {
      console.error('[WS] Error:', error);
    };
  }, [competitionId]);

  useEffect(() => {
    connect();

    // Keep-alive ping every 30 seconds
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);

    // BATCH UPDATE FLUSHER: Flushes WebSocket buffer to React state every 500ms
    const flushInterval = setInterval(() => {
      const buffer = updateBuffer.current;
      let hasUpdates = false;

      if (Object.keys(buffer.contestants).length > 0) {
        setContestantUpdates((prev) => ({ ...prev, ...buffer.contestants }));
        buffer.contestants = {}; // clear buffer
        hasUpdates = true;
      }

      if (buffer.incidents.length > 0) {
        setIncidentAlerts((prev) => [...buffer.incidents, ...prev].slice(0, 50));
        buffer.incidents = []; // clear buffer
        hasUpdates = true;
      }
      
      // if (hasUpdates) console.log('[WS] Flushed batched updates to UI');
    }, 500);

    return () => {
      clearInterval(pingInterval);
      clearInterval(flushInterval);
      clearTimeout(reconnectTimeout.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { isConnected, lastMessage, contestantUpdates, incidentAlerts };
}
