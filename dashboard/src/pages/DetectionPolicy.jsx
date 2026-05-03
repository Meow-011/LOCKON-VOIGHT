/**
 * Detection Policy Page — AI Detection Rule Management for LOCKON VOIGHT.
 * Manages blocked domains, processes, model file rules, and response actions.
 */

import { useState, useMemo, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Divider, Button, Chip,
  TextField, IconButton, alpha, Tooltip, Select, MenuItem, Checkbox,
} from '@mui/material';
import {
  Shield, Globe, Cpu, FileSearch, Plus, Trash2, Search,
  Zap, Eye, AlertTriangle, ChevronDown, ChevronUp, Filter, Download, Upload
} from 'lucide-react';
import toast from 'react-hot-toast';
import { COLORS } from '../theme/theme';

// ─── Category Definitions ────────────────────────────────────
const DOMAIN_CATEGORIES = {
  LLM_CHAT: { label: 'LLM CHAT', color: '#f43f5e' },
  CODE_AI: { label: 'CODE AI', color: '#a78bfa' },
  API: { label: 'API', color: '#f97316' },
  SEARCH_AI: { label: 'SEARCH AI', color: '#06b6d4' },
  IMAGE_AI: { label: 'IMAGE AI', color: '#ec4899' },
};

const PROCESS_CATEGORIES = {
  CODE_EDITOR: { label: 'CODE EDITOR', color: '#a78bfa' },
  LOCAL_LLM: { label: 'LOCAL LLM', color: '#f43f5e' },
  AI_AGENT: { label: 'AI AGENT', color: '#f97316' },
  CHAT_APP: { label: 'CHAT APP', color: '#06b6d4' },
};

const ACTIONS = {
  LOG_ONLY: { label: 'LOG ONLY / WHITELIST (+0)', color: COLORS.textMuted, icon: Eye },
  WARN: { label: 'WARN (+25)', color: COLORS.yellow, icon: AlertTriangle },
  ESCALATE: { label: 'ESCALATE (+50)', color: COLORS.red, icon: Zap },
};

const DEFAULT_DOMAINS = [
  // OpenAI
  { domain: 'chat.openai.com', category: 'LLM_CHAT', action: 'ESCALATE' },
  { domain: 'chatgpt.com', category: 'LLM_CHAT', action: 'ESCALATE' },
  { domain: 'api.openai.com', category: 'API', action: 'ESCALATE' },
  { domain: 'platform.openai.com', category: 'API', action: 'WARN' },
  // Anthropic
  { domain: 'claude.ai', category: 'LLM_CHAT', action: 'ESCALATE' },
  { domain: 'api.anthropic.com', category: 'API', action: 'ESCALATE' },
  // Google
  { domain: 'gemini.google.com', category: 'LLM_CHAT', action: 'WARN' },
  { domain: 'aistudio.google.com', category: 'LLM_CHAT', action: 'WARN' },
  { domain: 'generativelanguage.googleapis.com', category: 'API', action: 'ESCALATE' },
  // Microsoft & Meta
  { domain: 'copilot.microsoft.com', category: 'LLM_CHAT', action: 'ESCALATE' },
  { domain: 'meta.ai', category: 'LLM_CHAT', action: 'ESCALATE' },
  // DeepSeek
  { domain: 'chat.deepseek.com', category: 'LLM_CHAT', action: 'ESCALATE' },
  { domain: 'api.deepseek.com', category: 'API', action: 'ESCALATE' },
  // Mistral & Groq & Together
  { domain: 'api.mistral.ai', category: 'API', action: 'ESCALATE' },
  { domain: 'api.groq.com', category: 'API', action: 'ESCALATE' },
  { domain: 'api.together.xyz', category: 'API', action: 'ESCALATE' },
  // AI Search
  { domain: 'api.perplexity.ai', category: 'SEARCH_AI', action: 'WARN' },
  { domain: 'phind.com', category: 'SEARCH_AI', action: 'WARN' },
  { domain: 'you.com', category: 'SEARCH_AI', action: 'WARN' },
  // Code AI
  { domain: 'copilot-proxy.githubusercontent.com', category: 'CODE_AI', action: 'WARN' },
  { domain: 'api.githubcopilot.com', category: 'CODE_AI', action: 'WARN' },
  { domain: 'cody.dev', category: 'CODE_AI', action: 'WARN' },
  { domain: 'sourcegraph.com', category: 'CODE_AI', action: 'WARN' },
  { domain: 'blackbox.ai', category: 'CODE_AI', action: 'ESCALATE' },
  // xAI (Grok)
  { domain: 'grok.com', category: 'LLM_CHAT', action: 'ESCALATE' },
  { domain: 'api.x.ai', category: 'API', action: 'ESCALATE' },
  // Other Platforms
  { domain: 'poe.com', category: 'LLM_CHAT', action: 'WARN' },
  { domain: 'api-inference.huggingface.co', category: 'API', action: 'ESCALATE' },
  { domain: 'api.replicate.com', category: 'API', action: 'WARN' },
  { domain: 'api.cohere.ai', category: 'API', action: 'WARN' },
  { domain: 'midjourney.com', category: 'IMAGE_AI', action: 'LOG_ONLY' },
];

const DEFAULT_PROCESSES = [
  // AI Code Editors
  { name: 'cursor.exe', category: 'CODE_EDITOR', action: 'ESCALATE' },
  { name: 'windsurf.exe', category: 'CODE_EDITOR', action: 'ESCALATE' },
  { name: 'zed.exe', category: 'CODE_EDITOR', action: 'WARN' },
  { name: 'aide.exe', category: 'CODE_EDITOR', action: 'WARN' },
  { name: 'tabnine.exe', category: 'CODE_EDITOR', action: 'WARN' },
  { name: 'codeium.exe', category: 'CODE_EDITOR', action: 'WARN' },
  { name: 'codeium-agent.exe', category: 'CODE_EDITOR', action: 'WARN' },
  { name: 'copilot-agent.exe', category: 'CODE_EDITOR', action: 'WARN' },
  { name: 'copilot-agent-win.exe', category: 'CODE_EDITOR', action: 'WARN' },
  { name: 'pieces_os.exe', category: 'CODE_EDITOR', action: 'WARN' },
  // Local LLM Servers
  { name: 'ollama.exe', category: 'LOCAL_LLM', action: 'ESCALATE' },
  { name: 'lm studio.exe', category: 'LOCAL_LLM', action: 'ESCALATE' },
  { name: 'lmstudio-server.exe', category: 'LOCAL_LLM', action: 'ESCALATE' },
  { name: 'koboldcpp.exe', category: 'LOCAL_LLM', action: 'ESCALATE' },
  { name: 'localai.exe', category: 'LOCAL_LLM', action: 'ESCALATE' },
  { name: 'llama-server.exe', category: 'LOCAL_LLM', action: 'ESCALATE' },
  { name: 'jan.exe', category: 'LOCAL_LLM', action: 'ESCALATE' },
  { name: 'gpt4all.exe', category: 'LOCAL_LLM', action: 'ESCALATE' },
  { name: 'anythingllm.exe', category: 'LOCAL_LLM', action: 'ESCALATE' },
  { name: 'faraday.exe', category: 'LOCAL_LLM', action: 'ESCALATE' },
  // Autonomous AI Agents
  { name: 'aider.exe', category: 'AI_AGENT', action: 'ESCALATE' },
  { name: 'autogpt', category: 'AI_AGENT', action: 'ESCALATE' },
  { name: 'opendevin', category: 'AI_AGENT', action: 'ESCALATE' },
  { name: 'devika', category: 'AI_AGENT', action: 'ESCALATE' },
  { name: 'continue.exe', category: 'AI_AGENT', action: 'WARN' },
  // Desktop Chat Apps
  { name: 'chatgpt.exe', category: 'CHAT_APP', action: 'ESCALATE' },
  { name: 'claude.exe', category: 'CHAT_APP', action: 'ESCALATE' },
  // Subsystem & Virtualization (VULN-3 MITIGATION)
  { name: 'wsl.exe', category: 'LOCAL_LLM', action: 'WARN' },
  { name: 'vmmemwsl', category: 'LOCAL_LLM', action: 'WARN' },
  { name: 'docker.exe', category: 'LOCAL_LLM', action: 'WARN' },
  { name: 'dockerd.exe', category: 'LOCAL_LLM', action: 'WARN' },
];

const DEFAULT_EXTENSIONS = [
  // High-Performance GPU/Edge Execution
  { ext: '.engine', desc: 'TensorRT engine', action: 'ESCALATE' },
  { ext: '.trt', desc: 'TensorRT model', action: 'ESCALATE' },
  { ext: '.ncnn', desc: 'NCNN edge model', action: 'WARN' },
  // Quantized & Native Formats
  { ext: '.gguf', desc: 'llama.cpp quantized models', action: 'ESCALATE' },
  { ext: '.safetensors', desc: 'HuggingFace safe format', action: 'ESCALATE' },
  { ext: '.ggml', desc: 'Legacy GGML format', action: 'ESCALATE' },
  // Checkpoints & Graph Formats
  { ext: '.bin', desc: 'PyTorch binary (size-gated)', action: 'WARN' },
  { ext: '.pth', desc: 'PyTorch checkpoint', action: 'WARN' },
  { ext: '.pt', desc: 'PyTorch saved model', action: 'WARN' },
  { ext: '.ckpt', desc: 'Model checkpoint', action: 'WARN' },
  { ext: '.onnx', desc: 'ONNX runtime models', action: 'WARN' },
  { ext: '.tflite', desc: 'TensorFlow Lite model', action: 'WARN' },
  { ext: '.pb', desc: 'TensorFlow frozen graph', action: 'LOG_ONLY' },
  { ext: '.mlmodel', desc: 'Apple CoreML model', action: 'LOG_ONLY' },
];

// ─── Presets ──────────────────────────────────────────────────
const getDefaultAction = (type, keyVal) => {
  let defs, keyField;
  if (type === 'domain') { defs = DEFAULT_DOMAINS; keyField = 'domain'; }
  if (type === 'process') { defs = DEFAULT_PROCESSES; keyField = 'name'; }
  if (type === 'extension') { defs = DEFAULT_EXTENSIONS; keyField = 'ext'; }
  const match = defs.find(d => d[keyField] === keyVal);
  return match ? match.action : 'WARN';
};

const applyPreset = (preset, domains, processes, extensions) => {
  if (preset === 'STRICT') {
    return {
      domains: domains.map(d => ({ ...d, action: 'ESCALATE' })),
      processes: processes.map(p => ({ ...p, action: 'ESCALATE' })),
      extensions: extensions.map(e => ({ ...e, action: 'ESCALATE' })),
    };
  }
  if (preset === 'LAX') {
    return {
      domains: domains.map(d => ({ ...d, action: 'LOG_ONLY' })),
      processes: processes.map(p => ({ ...p, action: 'LOG_ONLY' })),
      extensions: extensions.map(e => ({ ...e, action: 'LOG_ONLY' })),
    };
  }
  // MODERATE: Restore defaults based on name/domain/ext if they exist in DEFAULTS, else default to WARN
  return {
    domains: domains.map(d => ({ ...d, action: getDefaultAction('domain', d.domain) })),
    processes: processes.map(p => ({ ...p, action: getDefaultAction('process', p.name) })),
    extensions: extensions.map(e => ({ ...e, action: getDefaultAction('extension', e.ext) })),
  };
};

// ─── Subcomponents ────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, color, count, onSelectAll, allSelected, someSelected }) {
  return (
    <Box sx={{ p: 2, borderBottom: `1px solid ${COLORS.border}`, bgcolor: COLORS.bgSurface, display: 'flex', alignItems: 'center', gap: 2 }}>
      {onSelectAll && (
        <Checkbox
          checked={allSelected || false}
          indeterminate={someSelected && !allSelected}
          onChange={onSelectAll}
          onClick={(e) => e.stopPropagation()}
          size="small"
          sx={{ p: 0, mr: 1, color: COLORS.borderLight, '&.Mui-checked, &.MuiCheckbox-indeterminate': { color } }}
        />
      )}
      <Icon size={20} color={color} />
      <Typography variant="subtitle1" sx={{ fontWeight: 800, letterSpacing: '0.05em', flex: 1 }}>{title}</Typography>
      <Chip label={`${count} RULES`} size="small" sx={{ bgcolor: alpha(color, 0.15), color, fontWeight: 800, fontSize: '0.65rem', borderRadius: 0, height: 22 }} />
    </Box>
  );
}

function ActionSelector({ value, onChange }) {
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      size="small"
      sx={{
        minWidth: 130, borderRadius: 0, height: 30, fontSize: '0.7rem', fontWeight: 800,
        fontFamily: 'monospace', letterSpacing: '0.05em',
        bgcolor: alpha(ACTIONS[value]?.color || '#555', 0.1),
        color: ACTIONS[value]?.color || '#555',
        '& .MuiOutlinedInput-notchedOutline': { borderColor: alpha(ACTIONS[value]?.color || '#555', 0.3) },
        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: ACTIONS[value]?.color },
        '& .MuiSelect-icon': { color: ACTIONS[value]?.color },
      }}
    >
      {Object.entries(ACTIONS).map(([key, { label, color }]) => (
        <MenuItem key={key} value={key} sx={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'monospace', color }}>
          {label}
        </MenuItem>
      ))}
    </Select>
  );
}

function CategoryChip({ category, categories }) {
  const cat = categories[category];
  if (!cat) return null;
  return (
    <Chip
      label={cat.label}
      size="small"
      sx={{
        bgcolor: alpha(cat.color, 0.12), color: cat.color,
        fontWeight: 800, fontSize: '0.6rem', borderRadius: 0, height: 20,
        letterSpacing: '0.05em',
      }}
    />
  );
}

function RuleRow({ label, category, categories, action, onActionChange, onDelete, selected, onToggle }) {
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 2, py: 1.2, px: 2,
      borderBottom: `1px solid ${COLORS.border}`,
      '&:hover': { bgcolor: alpha(COLORS.accent, 0.03) },
      bgcolor: selected ? alpha(COLORS.accent, 0.05) : 'transparent',
      transition: 'background 0.15s',
    }}>
      {onToggle && (
        <Checkbox
          checked={selected || false}
          onChange={onToggle}
          size="small"
          sx={{ p: 0, color: COLORS.borderLight, '&.Mui-checked': { color: COLORS.accent } }}
        />
      )}
      <Typography sx={{ fontFamily: 'monospace', fontSize: '0.8rem', color: COLORS.textPrimary, flex: 1, fontWeight: 500 }}>
        {label}
      </Typography>
      {category && <CategoryChip category={category} categories={categories} />}
      <ActionSelector value={action} onChange={onActionChange} />
      <Tooltip title="Remove rule">
        <IconButton size="small" onClick={onDelete} sx={{ color: COLORS.textMuted, '&:hover': { color: COLORS.red } }}>
          <Trash2 size={14} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

function AddRuleBar({ placeholder, onAdd }) {
  const [value, setValue] = useState('');
  const handleAdd = () => {
    if (value.trim()) {
      onAdd(value.trim());
      setValue('');
    }
  };
  return (
    <Box sx={{ display: 'flex', gap: 1, p: 2, borderTop: `1px solid ${COLORS.border}`, bgcolor: COLORS.bgDeep }}>
      <TextField
        fullWidth size="small" placeholder={placeholder} value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        InputProps={{
          startAdornment: <Typography sx={{ color: COLORS.accent, mr: 1, fontFamily: 'monospace', fontWeight: 'bold' }}>{'>_'}</Typography>
        }}
        sx={{
          '& .MuiOutlinedInput-root': {
            borderRadius: 0, bgcolor: '#000', fontFamily: 'monospace', color: COLORS.textSecondary, fontSize: '0.8rem',
            '& fieldset': { borderColor: COLORS.borderLight },
            '&:hover fieldset': { borderColor: COLORS.textMuted },
            '&.Mui-focused fieldset': { borderColor: COLORS.accent },
          }
        }}
      />
      <Button onClick={handleAdd} variant="contained" sx={{
        bgcolor: COLORS.accent, color: '#000', borderRadius: 0, fontWeight: 800, minWidth: 44, px: 2,
        '&:hover': { bgcolor: '#fff' },
      }}>
        <Plus size={16} />
      </Button>
    </Box>
  );
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { policyAPI } from '../services/api';

// ─── Main Component ──────────────────────────────────────────
export default function DetectionPolicyPage() {
  const queryClient = useQueryClient();
  
  const { data: policyData, isLoading } = useQuery({
    queryKey: ['systemPolicy'],
    queryFn: async () => {
      const res = await policyAPI.get();
      return res.data;
    }
  });

  const [domains, setDomains] = useState(DEFAULT_DOMAINS);
  const [processes, setProcesses] = useState(DEFAULT_PROCESSES);
  const [extensions, setExtensions] = useState(DEFAULT_EXTENSIONS);
  const [activePreset, setActivePreset] = useState('MODERATE');
  const [customBackup, setCustomBackup] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState({ domains: true, processes: true, files: true });
  const [minFileSizeMB, setMinFileSizeMB] = useState(100);

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ domains, processes, extensions, min_file_size_mb: minFileSizeMB }, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `lockon_policy_${new Date().toISOString().split('T')[0]}.json`);
    dlAnchorElem.click();
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fileReader = new FileReader();
    fileReader.readAsText(file, "UTF-8");
    fileReader.onload = evt => {
      try {
        const result = JSON.parse(evt.target.result);
        if (result.domains) setDomains(result.domains);
        if (result.processes) setProcesses(result.processes);
        if (result.extensions) setExtensions(result.extensions);
        if (result.min_file_size_mb) setMinFileSizeMB(result.min_file_size_mb);
        setActivePreset('CUSTOM');
        toast.success("Policy imported successfully.");
      } catch (err) {
        toast.error("Failed to parse policy JSON.");
      }
      e.target.value = null;
    };
  };

  // Bulk action states
  const [selectedDomains, setSelectedDomains] = useState(new Set());
  const [selectedProcesses, setSelectedProcesses] = useState(new Set());
  const [selectedExtensions, setSelectedExtensions] = useState(new Set());

  const handleBulkAction = (type, action) => {
    setActivePreset('CUSTOM');
    if (type === 'domains') {
      if (action === 'DELETE') setDomains(domains.filter(d => !selectedDomains.has(d.domain)));
      else setDomains(domains.map(d => selectedDomains.has(d.domain) ? { ...d, action } : d));
      setSelectedDomains(new Set());
    } else if (type === 'processes') {
      if (action === 'DELETE') setProcesses(processes.filter(p => !selectedProcesses.has(p.name)));
      else setProcesses(processes.map(p => selectedProcesses.has(p.name) ? { ...p, action } : p));
      setSelectedProcesses(new Set());
    } else if (type === 'extensions') {
      if (action === 'DELETE') setExtensions(extensions.filter(e => !selectedExtensions.has(e.ext)));
      else setExtensions(extensions.map(e => selectedExtensions.has(e.ext) ? { ...e, action } : e));
      setSelectedExtensions(new Set());
    }
  };

  const toggleSelection = (type, id) => {
    const updater = (prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    };
    if (type === 'domains') setSelectedDomains(updater);
    else if (type === 'processes') setSelectedProcesses(updater);
    else if (type === 'extensions') setSelectedExtensions(updater);
  };

  const handleSelectAll = (type) => {
    if (type === 'domains') {
      if (selectedDomains.size === filteredDomains.length && filteredDomains.length > 0) setSelectedDomains(new Set());
      else setSelectedDomains(new Set(filteredDomains.map(d => d.domain)));
    } else if (type === 'processes') {
      if (selectedProcesses.size === filteredProcesses.length && filteredProcesses.length > 0) setSelectedProcesses(new Set());
      else setSelectedProcesses(new Set(filteredProcesses.map(p => p.name)));
    } else if (type === 'extensions') {
      if (selectedExtensions.size === extensions.length && extensions.length > 0) setSelectedExtensions(new Set());
      else setSelectedExtensions(new Set(extensions.map(e => e.ext)));
    }
  };

  const BulkActionBar = ({ count, type }) => {
    if (count === 0) return null;
    return (
      <Box sx={{ p: 1.5, px: 2, bgcolor: alpha(COLORS.accent, 0.08), borderBottom: `1px solid ${COLORS.borderLight}`, display: 'flex', gap: 2, alignItems: 'center' }}>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: COLORS.accent, fontFamily: 'monospace' }}>
          {count} SELECTED
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button size="small" sx={{ color: ACTIONS['ESCALATE'].color, fontSize: '0.7rem', fontWeight: 'bold' }} onClick={() => handleBulkAction(type, 'ESCALATE')}>SET ESCALATE</Button>
        <Button size="small" sx={{ color: ACTIONS['WARN'].color, fontSize: '0.7rem', fontWeight: 'bold' }} onClick={() => handleBulkAction(type, 'WARN')}>SET WARN</Button>
        <Button size="small" sx={{ color: ACTIONS['LOG_ONLY'].color, fontSize: '0.7rem', fontWeight: 'bold' }} onClick={() => handleBulkAction(type, 'LOG_ONLY')}>SET LOG ONLY</Button>
        <Button size="small" sx={{ color: COLORS.red, fontSize: '0.7rem', fontWeight: 'bold' }} onClick={() => handleBulkAction(type, 'DELETE')}>DELETE</Button>
      </Box>
    );
  };

  // Sync state when policy data loads
  useEffect(() => {
    if (policyData) {
      const loadedDomains = policyData.domains.length > 0 ? policyData.domains : DEFAULT_DOMAINS;
      const loadedProcesses = policyData.processes.length > 0 ? policyData.processes : DEFAULT_PROCESSES;
      const loadedExtensions = policyData.extensions.length > 0 ? policyData.extensions : DEFAULT_EXTENSIONS;
      
      setDomains(loadedDomains);
      setProcesses(loadedProcesses);
      setExtensions(loadedExtensions);
      setMinFileSizeMB(policyData.min_file_size_mb || 100);

      // Infer active preset
      const allItems = [...loadedDomains, ...loadedProcesses, ...loadedExtensions];
      const hasModifiedCounts = 
        loadedDomains.length !== DEFAULT_DOMAINS.length || 
        loadedProcesses.length !== DEFAULT_PROCESSES.length || 
        loadedExtensions.length !== DEFAULT_EXTENSIONS.length;

      if (hasModifiedCounts) {
        setActivePreset('CUSTOM');
      } else if (allItems.length > 0 && allItems.every(i => i.action === 'ESCALATE')) {
        setActivePreset('STRICT');
      } else if (allItems.length > 0 && allItems.every(i => i.action === 'LOG_ONLY')) {
        setActivePreset('LAX');
      } else {
        const moderateMatch = 
          loadedDomains.every(d => d.action === getDefaultAction('domain', d.domain)) &&
          loadedProcesses.every(p => p.action === getDefaultAction('process', p.name)) &&
          loadedExtensions.every(e => e.action === getDefaultAction('extension', e.ext));
        
        setActivePreset(moderateMatch ? 'MODERATE' : 'CUSTOM');
      }
    }
  }, [policyData]);

  const deployMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        domains,
        processes,
        extensions,
        min_file_size_mb: minFileSizeMB
      };
      await policyAPI.update(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['systemPolicy']);
      toast.success('Detection policy deployed to all connected agents successfully.');
    },
    onError: (err) => {
      console.error(err);
      toast.error('Failed to deploy detection policy.');
    }
  });

  const toggleSection = (key) => setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));

  const handlePreset = (preset) => {
    if (preset !== 'CUSTOM' && activePreset === 'CUSTOM') {
      // Backup custom state before switching
      setCustomBackup({ domains, processes, extensions });
    }

    setActivePreset(preset);
    
    if (preset === 'CUSTOM') {
      if (customBackup) {
        setDomains(customBackup.domains);
        setProcesses(customBackup.processes);
        setExtensions(customBackup.extensions);
      } else {
        const baseDomains = policyData?.domains?.length > 0 ? policyData.domains : DEFAULT_DOMAINS;
        const baseProcesses = policyData?.processes?.length > 0 ? policyData.processes : DEFAULT_PROCESSES;
        const baseExtensions = policyData?.extensions?.length > 0 ? policyData.extensions : DEFAULT_EXTENSIONS;
        setDomains(baseDomains);
        setProcesses(baseProcesses);
        setExtensions(baseExtensions);
      }
      return;
    }

    const baseDomains = policyData?.domains?.length > 0 ? policyData.domains : DEFAULT_DOMAINS;
    const baseProcesses = policyData?.processes?.length > 0 ? policyData.processes : DEFAULT_PROCESSES;
    const baseExtensions = policyData?.extensions?.length > 0 ? policyData.extensions : DEFAULT_EXTENSIONS;
    
    const result = applyPreset(preset, baseDomains, baseProcesses, baseExtensions);
    setDomains(result.domains);
    setProcesses(result.processes);
    setExtensions(result.extensions);
  };

  const isDirty = useMemo(() => {
    if (!policyData) return false;
    const baseDomains = policyData.domains?.length > 0 ? policyData.domains : DEFAULT_DOMAINS;
    const baseProcesses = policyData.processes?.length > 0 ? policyData.processes : DEFAULT_PROCESSES;
    const baseExtensions = policyData.extensions?.length > 0 ? policyData.extensions : DEFAULT_EXTENSIONS;
    
    return JSON.stringify(domains) !== JSON.stringify(baseDomains) ||
           JSON.stringify(processes) !== JSON.stringify(baseProcesses) ||
           JSON.stringify(extensions) !== JSON.stringify(baseExtensions) ||
           minFileSizeMB !== (policyData.min_file_size_mb || 100);
  }, [domains, processes, extensions, minFileSizeMB, policyData]);

  // Filter by search
  const filteredDomains = useMemo(() =>
    domains.filter(d => d.domain.toLowerCase().includes(searchQuery.toLowerCase())),
    [domains, searchQuery]
  );
  const filteredProcesses = useMemo(() =>
    processes.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [processes, searchQuery]
  );

  const totalRules = domains.length + processes.length + extensions.length;
  const escalateCount = [...domains, ...processes, ...extensions].filter(r => r.action === 'ESCALATE').length;

  if (isLoading) return <Box sx={{ p: 4, color: COLORS.textMuted, fontFamily: 'monospace' }}>LOADING POLICY...</Box>;

  return (
    <Box className="fade-in" sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}>
            <Shield size={28} color={COLORS.accent} />
            DETECTION POLICY
          </Typography>
          <Typography variant="body2" sx={{ color: COLORS.textMuted, mt: 1, fontFamily: 'monospace' }}>
            AI USAGE DETECTION RULES & RESPONSE ACTIONS
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Typography sx={{ fontFamily: 'monospace', color: COLORS.textMuted, fontSize: '0.65rem', mr: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Zap size={12} color={COLORS.green} /> LAST SYNC: ACTIVE
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <input type="file" id="import-policy" style={{ display: 'none' }} accept=".json" onChange={handleImport} />
            <Button variant="outlined" size="small" onClick={() => document.getElementById('import-policy').click()} startIcon={<Upload size={14} />} sx={{ borderColor: COLORS.borderLight, color: COLORS.textPrimary, borderRadius: 0, fontFamily: 'monospace', fontSize: '0.7rem' }}>IMPORT JSON</Button>
            <Button variant="outlined" size="small" onClick={handleExport} startIcon={<Download size={14} />} sx={{ borderColor: COLORS.borderLight, color: COLORS.textPrimary, borderRadius: 0, fontFamily: 'monospace', fontSize: '0.7rem' }}>EXPORT JSON</Button>
          </Box>
          <Box sx={{ display: 'flex', gap: 3, alignItems: 'center', bgcolor: 'rgba(255, 255, 255, 0.03)', px: 3, py: 1.5, border: `1px solid ${COLORS.borderLight}` }}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontFamily: 'monospace', fontSize: '1.5rem', fontWeight: 800, color: COLORS.textPrimary, lineHeight: 1 }}>{totalRules}</Typography>
            <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6rem', color: COLORS.textMuted, letterSpacing: '0.1em', mt: 0.5 }}>TOTAL RULES</Typography>
          </Box>
          <Box sx={{ width: '1px', height: 32, bgcolor: COLORS.borderLight }} />
          <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontFamily: 'monospace', fontSize: '1.5rem', fontWeight: 800, color: COLORS.red, lineHeight: 1 }}>{escalateCount}</Typography>
            <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6rem', color: COLORS.red, letterSpacing: '0.1em', mt: 0.5 }}>ESCALATE</Typography>
          </Box>
        </Box>
      </Box>
      </Box>

      {/* Action Legend */}
      <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', md: 'row' } }}>
        <Box sx={{ flex: 1, p: 1.5, bgcolor: alpha(COLORS.textMuted, 0.05), borderLeft: `3px solid ${COLORS.textMuted}` }}>
          <Typography sx={{ color: COLORS.textPrimary, fontSize: '0.75rem', fontWeight: 800, fontFamily: 'monospace', mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Eye size={14} color={COLORS.textMuted} /> LOG ONLY (WHITELIST) / +0 SCORE
          </Typography>
          <Typography sx={{ color: COLORS.textMuted, fontSize: '0.7rem', fontFamily: 'monospace' }}>
            Acts as a Safe Zone. Records the event silently without increasing the contestant's Integrity Score.
          </Typography>
        </Box>
        <Box sx={{ flex: 1, p: 1.5, bgcolor: alpha(COLORS.yellow, 0.05), borderLeft: `3px solid ${COLORS.yellow}` }}>
          <Typography sx={{ color: COLORS.yellow, fontSize: '0.75rem', fontWeight: 800, fontFamily: 'monospace', mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            <AlertTriangle size={14} /> WARN (+25 SCORE)
          </Typography>
          <Typography sx={{ color: COLORS.textMuted, fontSize: '0.7rem', fontFamily: 'monospace' }}>
            Increases the score moderately. Pushes the contestant to a YELLOW warning state.
          </Typography>
        </Box>
        <Box sx={{ flex: 1, p: 1.5, bgcolor: alpha(COLORS.red, 0.05), borderLeft: `3px solid ${COLORS.red}` }}>
          <Typography sx={{ color: COLORS.red, fontSize: '0.75rem', fontWeight: 800, fontFamily: 'monospace', mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Zap size={14} /> ESCALATE (+50 SCORE)
          </Typography>
          <Typography sx={{ color: COLORS.textMuted, fontSize: '0.7rem', fontFamily: 'monospace' }}>
            Triggers an immediate RED critical state and highly impacts the Integrity Score.
          </Typography>
        </Box>
      </Box>

      {/* Integrity Score Mechanics */}
      <Box sx={{ bgcolor: alpha(COLORS.accent, 0.05), border: `1px dashed ${COLORS.accent}`, p: 2, display: 'flex', gap: 2, alignItems: 'flex-start' }}>
        <Shield size={20} color={COLORS.accent} style={{ marginTop: 2 }} />
        <Box>
          <Typography sx={{ color: COLORS.accent, fontSize: '0.8rem', fontWeight: 800, fontFamily: 'monospace', mb: 0.5, letterSpacing: '0.05em' }}>
            INTEGRITY SCORE MECHANICS
          </Typography>
          <Typography sx={{ color: COLORS.textMuted, fontSize: '0.75rem', fontFamily: 'monospace', lineHeight: 1.6 }}>
            The Integrity Score starts at <strong style={{ color: COLORS.green }}>0 (GREEN)</strong>. Each triggered rule adds weight to the score. 
            Reaching <strong style={{ color: COLORS.yellow }}>50+ (YELLOW)</strong> indicates suspicious behavior requiring observation. 
            Hitting <strong style={{ color: COLORS.red }}>100 (RED)</strong> marks the node as <strong>COMPROMISED</strong>, at which point Control Operators should deploy a <strong>Tactical Screen Lock</strong> payload to halt the contestant.
          </Typography>
        </Box>
      </Box>

      {/* Presets + Search Bar */}
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Presets */}
        <Box sx={{ display: 'flex', border: `1px solid ${COLORS.borderLight}` }}>
          {[
            { key: 'STRICT', label: 'STRICT', color: COLORS.red },
            { key: 'MODERATE', label: 'MODERATE', color: COLORS.yellow },
            { key: 'LAX', label: 'LAX', color: COLORS.green },
            { key: 'CUSTOM', label: 'CUSTOM', color: '#9ca3af' },
          ].map(p => (
            <Button
              key={p.key}
              onClick={() => handlePreset(p.key)}
              sx={{
                borderRadius: 0, minWidth: 100, py: 0.8, fontWeight: 800, fontSize: '0.7rem',
                letterSpacing: '0.08em', fontFamily: 'monospace',
                bgcolor: activePreset === p.key ? p.color : 'transparent',
                color: activePreset === p.key ? '#000' : COLORS.textMuted,
                borderRight: `1px solid ${COLORS.borderLight}`,
                '&:last-child': { borderRight: 'none' },
                '&:hover': { bgcolor: activePreset === p.key ? p.color : alpha(p.color, 0.1) },
              }}
            >
              {p.label}
            </Button>
          ))}
        </Box>

        {/* Search */}
        <TextField
          placeholder="Search rules..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          size="small"
          InputProps={{
            startAdornment: <Search size={14} style={{ marginRight: 8, color: COLORS.textMuted }} />,
          }}
          sx={{
            flex: 1, minWidth: 200,
            '& .MuiOutlinedInput-root': {
              borderRadius: 0, bgcolor: COLORS.bgSurface, fontSize: '0.8rem',
              '& fieldset': { borderColor: COLORS.border },
              '&:hover fieldset': { borderColor: COLORS.borderLight },
            }
          }}
        />
      </Box>

      {/* SECTION 1: Blocked Domains */}
      <Card sx={{ bgcolor: COLORS.bgDeep, border: `1px solid ${COLORS.border}`, borderRadius: 0 }}>
        <Box onClick={() => toggleSection('domains')} sx={{ cursor: 'pointer' }}>
          <SectionHeader
            icon={Globe} title="BLOCKED DOMAINS" color="#f43f5e" count={domains.length}
            onSelectAll={() => handleSelectAll('domains')}
            allSelected={selectedDomains.size > 0 && selectedDomains.size === filteredDomains.length}
            someSelected={selectedDomains.size > 0}
          />
        </Box>
        {expandedSections.domains && (
          <>
            <BulkActionBar count={selectedDomains.size} type="domains" />
            <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
              {filteredDomains.map((d, i) => (
                <RuleRow
                  key={d.domain}
                  label={d.domain}
                  category={d.category}
                  categories={DOMAIN_CATEGORIES}
                  action={d.action}
                  onActionChange={(action) => {
                    const updated = [...domains];
                    const idx = domains.findIndex(x => x.domain === d.domain);
                    updated[idx] = { ...updated[idx], action };
                    setDomains(updated);
                    setActivePreset('CUSTOM');
                  }}
                  onDelete={() => {
                    setDomains(domains.filter(x => x.domain !== d.domain));
                    setActivePreset('CUSTOM');
                  }}
                  selected={selectedDomains.has(d.domain)}
                  onToggle={() => toggleSelection('domains', d.domain)}
                />
              ))}
              {filteredDomains.length === 0 && (
                <Typography sx={{ p: 3, textAlign: 'center', color: COLORS.textMuted, fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  No matching domains found.
                </Typography>
              )}
            </Box>
            <AddRuleBar
              placeholder="Add domain (e.g. chat.openai.com)"
              onAdd={(val) => {
                setDomains([...domains, { domain: val, category: 'LLM_CHAT', action: 'WARN' }]);
                setActivePreset('CUSTOM');
              }}
            />
          </>
        )}
      </Card>

      {/* SECTION 2: Blocked Processes */}
      <Card sx={{ bgcolor: COLORS.bgDeep, border: `1px solid ${COLORS.border}`, borderRadius: 0 }}>
        <Box onClick={() => toggleSection('processes')} sx={{ cursor: 'pointer' }}>
          <SectionHeader
            icon={Cpu} title="BLOCKED PROCESSES" color="#a78bfa" count={processes.length}
            onSelectAll={() => handleSelectAll('processes')}
            allSelected={selectedProcesses.size > 0 && selectedProcesses.size === filteredProcesses.length}
            someSelected={selectedProcesses.size > 0}
          />
        </Box>
        {expandedSections.processes && (
          <>
            <BulkActionBar count={selectedProcesses.size} type="processes" />
            <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
              {filteredProcesses.map((p, i) => (
                <RuleRow
                  key={p.name}
                  label={p.name}
                  category={p.category}
                  categories={PROCESS_CATEGORIES}
                  action={p.action}
                  onActionChange={(action) => {
                    const updated = [...processes];
                    const idx = processes.findIndex(x => x.name === p.name);
                    updated[idx] = { ...updated[idx], action };
                    setProcesses(updated);
                    setActivePreset('CUSTOM');
                  }}
                  onDelete={() => {
                    setProcesses(processes.filter(x => x.name !== p.name));
                    setActivePreset('CUSTOM');
                  }}
                  selected={selectedProcesses.has(p.name)}
                  onToggle={() => toggleSelection('processes', p.name)}
                />
              ))}
              {filteredProcesses.length === 0 && (
                <Typography sx={{ p: 3, textAlign: 'center', color: COLORS.textMuted, fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  No matching processes found.
                </Typography>
              )}
            </Box>
            <AddRuleBar
              placeholder="Add process name (e.g. myapp.exe)"
              onAdd={(val) => {
                setProcesses([...processes, { name: val, category: 'AI_AGENT', action: 'WARN' }]);
                setActivePreset('CUSTOM');
              }}
            />
          </>
        )}
      </Card>

      {/* SECTION 3: Model File Rules */}
      <Card sx={{ bgcolor: COLORS.bgDeep, border: `1px solid ${COLORS.border}`, borderRadius: 0 }}>
        <Box onClick={() => toggleSection('files')} sx={{ cursor: 'pointer' }}>
          <SectionHeader
            icon={FileSearch} title="MODEL FILE RULES" color={COLORS.yellow} count={extensions.length}
            onSelectAll={() => handleSelectAll('extensions')}
            allSelected={selectedExtensions.size > 0 && selectedExtensions.size === extensions.length}
            someSelected={selectedExtensions.size > 0}
          />
        </Box>
        {expandedSections.files && (
          <>
            {/* Min file size control */}
            <Box sx={{ p: 2, borderBottom: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: COLORS.textSecondary, fontWeight: 700 }}>
                MIN FILE SIZE:
              </Typography>
              <TextField
                type="number" size="small" value={minFileSizeMB}
                onChange={(e) => setMinFileSizeMB(Number(e.target.value))}
                sx={{
                  width: 80,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 0, bgcolor: '#000', fontFamily: 'monospace', fontSize: '0.8rem',
                    color: COLORS.yellow, fontWeight: 800, textAlign: 'center',
                    '& fieldset': { borderColor: COLORS.borderLight },
                    '&.Mui-focused fieldset': { borderColor: COLORS.yellow },
                  },
                  '& input': { textAlign: 'center' },
                }}
              />
              <Typography sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: COLORS.textMuted }}>MB</Typography>
              <Typography sx={{ fontFamily: 'monospace', fontSize: '0.65rem', color: COLORS.textMuted, ml: 'auto' }}>
                Files below this size will be ignored
              </Typography>
            </Box>
            <BulkActionBar count={selectedExtensions.size} type="extensions" />
            <Box>
              {extensions.map((ext, i) => (
                <Box key={ext.ext} sx={{
                  display: 'flex', alignItems: 'center', gap: 2, py: 1.2, px: 2,
                  borderBottom: `1px solid ${COLORS.border}`,
                  '&:hover': { bgcolor: alpha(COLORS.accent, 0.03) },
                  bgcolor: selectedExtensions.has(ext.ext) ? alpha(COLORS.accent, 0.05) : 'transparent',
                }}>
                  <Checkbox
                    checked={selectedExtensions.has(ext.ext)}
                    onChange={() => toggleSelection('extensions', ext.ext)}
                    size="small"
                    sx={{ p: 0, mr: 1, color: COLORS.borderLight, '&.Mui-checked': { color: COLORS.accent } }}
                  />
                  <Chip label={ext.ext} size="small" sx={{
                    bgcolor: alpha(COLORS.yellow, 0.12), color: COLORS.yellow,
                    fontWeight: 800, fontSize: '0.75rem', borderRadius: 0, fontFamily: 'monospace',
                  }} />
                  <Typography sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: COLORS.textMuted, flex: 1 }}>
                    {ext.desc}
                  </Typography>
                  <ActionSelector
                    value={ext.action}
                    onChange={(action) => {
                      const updated = [...extensions];
                      updated[i] = { ...updated[i], action };
                      setExtensions(updated);
                      setActivePreset('CUSTOM');
                    }}
                  />
                  <Tooltip title="Remove">
                    <IconButton size="small" onClick={() => {
                      setExtensions(extensions.filter((_, j) => j !== i));
                      setActivePreset('CUSTOM');
                    }} sx={{ color: COLORS.textMuted, '&:hover': { color: COLORS.red } }}>
                      <Trash2 size={14} />
                    </IconButton>
                  </Tooltip>
                </Box>
              ))}
            </Box>
            <AddRuleBar
              placeholder="Add file extension (e.g. .tflite)"
              onAdd={(val) => {
                setExtensions([...extensions, { ext: val.startsWith('.') ? val : `.${val}`, desc: 'Custom rule', action: 'WARN' }]);
                setActivePreset('CUSTOM');
              }}
            />
          </>
        )}
      </Card>

      {/* Deploy Bar */}
      <Box sx={{
        position: 'sticky', bottom: 0, py: 2,
        borderTop: `2px solid ${COLORS.yellow}`, bgcolor: alpha(COLORS.bgCard, 0.95), backdropFilter: 'blur(8px)', zIndex: 10,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 3,
        mt: 2, px: 4,
        transform: isDirty ? 'translateY(0)' : 'translateY(150%)',
        opacity: isDirty ? 1 : 0,
        transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease',
        pointerEvents: isDirty ? 'auto' : 'none'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography sx={{ fontFamily: 'monospace', color: COLORS.textMuted, fontSize: '0.75rem' }}>
            {totalRules} rules configured — {escalateCount} set to ESCALATE
          </Typography>
          {isDirty && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, animation: 'pulse 2s infinite', ml: 2 }}>
              <Box sx={{ width: 8, height: 8, bgcolor: COLORS.yellow, borderRadius: '50%' }} />
              <Typography sx={{ fontFamily: 'monospace', color: COLORS.yellow, fontSize: '0.85rem', fontWeight: 800, letterSpacing: '0.05em' }}>
                UNSAVED CHANGES DETECTED
              </Typography>
            </Box>
          )}
        </Box>
        <Button
          variant="contained"
          onClick={() => deployMutation.mutate()}
          disabled={deployMutation.isPending || !isDirty}
          sx={{
            bgcolor: COLORS.yellow, color: '#000', borderRadius: 0, fontWeight: 900,
            letterSpacing: '0.05em', px: 4,
            '&:hover': { bgcolor: '#fff' },
            '&.Mui-disabled': { bgcolor: alpha(COLORS.yellow, 0.3), color: '#555' }
          }}
        >
          {deployMutation.isPending ? 'DEPLOYING...' : 'DEPLOY TO AGENTS'}
        </Button>
      </Box>
    </Box>
  );
}
