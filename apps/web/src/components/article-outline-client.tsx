"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type NodeFragmentItem = {
  id: number;
  title?: string | null;
  distilledContent: string;
  shared?: boolean;
};

type NodeItem = {
  id: number;
  title: string;
  description: string | null;
  sortOrder: number;
  fragments: NodeFragmentItem[];
};

type FragmentOption = {
  id: number;
  title?: string | null;
  distilledContent: string;
  shared?: boolean;
};

type OutlineCanvasView = "board" | "list";
type BoardNodePosition = { x: number; y: number };
type BoardLayoutPreset = "focus" | "balance" | "spread";
type BoardGuide = {
  id: string;
  orientation: "vertical" | "horizontal";
  offset: number;
  label: string;
};
type BoardDropEcho = {
  nodeId: number;
  label: string;
  stamp: number;
};
type BoardViewport = {
  left: number;
  top: number;
  width: number;
  height: number;
  scrollWidth: number;
  scrollHeight: number;
};

const BOARD_CARD_WIDTH = 320;
const BOARD_CARD_HEIGHT = 332;
const BOARD_CANVAS_PADDING = 24;
const BOARD_MIN_HEIGHT = 460;
const BOARD_LAYOUT_STORAGE_VERSION = "v2";
const BOARD_SOUND_STORAGE_VERSION = "v1";
const BOARD_COLUMN_GAP = 28;
const BOARD_ROW_GAP = 26;
const BOARD_GRID_STEP = 24;
const BOARD_SNAP_THRESHOLD = 18;
const BOARD_VIEWPORT_MAX_HEIGHT = 760;
const BOARD_VIEWPORT_MIN_HEIGHT = 420;
const BOARD_MINIMAP_MAX_WIDTH = 248;
const BOARD_MINIMAP_MAX_HEIGHT = 172;

const OUTLINE_CLASSIC_OPENING_PATTERNS: Array<{ title: string; detail: string }> = [
  {
    title: "先放一个异样场景",
    detail: "先让读者看见某个不对劲的细节，再把它挂到第一张节点卡里。",
  },
  {
    title: "先立反直觉判断",
    detail: "大纲第一卡可以先落一个判断，再往后补它为何成立。",
  },
  {
    title: "先提真正的问题",
    detail: "如果还没想好结构，就先把最想追问的问题写成第一块卡片。",
  },
];

function hashSeed(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function pickSeededItems<T>(items: T[], count: number, seedSource: string) {
  if (items.length <= count) return items;
  const pool = [...items];
  const selected: T[] = [];
  let seed = hashSeed(seedSource);
  while (pool.length > 0 && selected.length < count) {
    const index = seed % pool.length;
    const [item] = pool.splice(index, 1);
    if (item) {
      selected.push(item);
    }
    seed = (seed * 1103515245 + 12345) >>> 0;
  }
  return selected;
}

function getBoardLayoutStorageKey(articleId: number) {
  return `huoziwriter:outline-board-layout:${BOARD_LAYOUT_STORAGE_VERSION}:${articleId}`;
}

function getBoardSoundStorageKey() {
  return `huoziwriter:outline-board-sound:${BOARD_SOUND_STORAGE_VERSION}`;
}

function sanitizeBoardPositions(
  nodes: NodeItem[],
  source: Record<string, BoardNodePosition> | Record<number, BoardNodePosition> | null | undefined,
  fallback: Record<number, BoardNodePosition>,
) {
  const normalizedSource = source as Record<string, BoardNodePosition> | undefined;
  return nodes.reduce<Record<number, BoardNodePosition>>((positions, node) => {
    const saved = normalizedSource?.[String(node.id)];
    positions[node.id] = saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)
      ? { x: saved.x, y: saved.y }
      : fallback[node.id];
    return positions;
  }, {});
}

function getBoardCanvasWidth(canvasWidth?: number) {
  return Math.max(BOARD_CARD_WIDTH + BOARD_CANVAS_PADDING * 2, canvasWidth ?? BOARD_CARD_WIDTH * 2 + BOARD_CANVAS_PADDING * 2 + BOARD_COLUMN_GAP);
}

function buildPresetBoardPositions(nodes: NodeItem[], preset: BoardLayoutPreset, canvasWidth?: number) {
  const safeWidth = getBoardCanvasWidth(canvasWidth);
  const presetColumns =
    preset === "focus"
      ? 1
      : preset === "spread"
        ? Math.max(2, Math.min(3, Math.floor((safeWidth - BOARD_CANVAS_PADDING * 2 + BOARD_COLUMN_GAP) / (BOARD_CARD_WIDTH + BOARD_COLUMN_GAP))))
        : 2;
  const columns = Math.max(1, presetColumns);
  const contentWidth = columns * BOARD_CARD_WIDTH + Math.max(0, columns - 1) * BOARD_COLUMN_GAP;
  const startX = Math.max(BOARD_CANVAS_PADDING, Math.floor((safeWidth - contentWidth) / 2));
  const positions: Record<number, BoardNodePosition> = {};
  let cursorY = BOARD_CANVAS_PADDING;
  for (let index = 0; index < nodes.length; index += columns) {
    const rowNodes = nodes.slice(index, index + columns);
    const rowHeight = rowNodes.reduce((maxHeight, node) => Math.max(maxHeight, getNodeBoardHeight(node)), BOARD_CARD_HEIGHT);
    rowNodes.forEach((node, rowIndex) => {
      const staggerOffset = preset === "spread" && rowIndex % 2 === 1 ? 28 : 0;
      positions[node.id] = {
        x: startX + rowIndex * (BOARD_CARD_WIDTH + BOARD_COLUMN_GAP),
        y: cursorY + staggerOffset,
      };
    });
    cursorY += rowHeight + BOARD_ROW_GAP + (preset === "focus" ? 18 : 0);
  }
  return positions;
}

function buildDefaultBoardPositions(nodes: NodeItem[], canvasWidth?: number) {
  return buildPresetBoardPositions(nodes, "balance", canvasWidth);
}

function formatBoardPresetLabel(preset: BoardLayoutPreset) {
  if (preset === "focus") return "聚焦纵列";
  if (preset === "spread") return "展开铺陈";
  return "双列平衡";
}

function clampBoardPosition(position: BoardNodePosition, canvasWidth: number, canvasHeight: number) {
  const maxX = Math.max(BOARD_CANVAS_PADDING, canvasWidth - BOARD_CARD_WIDTH - BOARD_CANVAS_PADDING);
  const maxY = Math.max(BOARD_CANVAS_PADDING, canvasHeight - BOARD_CARD_HEIGHT - BOARD_CANVAS_PADDING);
  return {
    x: Math.min(Math.max(BOARD_CANVAS_PADDING, position.x), maxX),
    y: Math.min(Math.max(BOARD_CANVAS_PADDING, position.y), maxY),
  };
}

function getNodeBoardHeight(node: NodeItem) {
  return BOARD_CARD_HEIGHT + Math.max(0, node.fragments.length - 2) * 28;
}

function buildBoardViewportSnapshot(element: HTMLDivElement, fallbackWidth: number, fallbackHeight: number): BoardViewport {
  return {
    left: element.scrollLeft,
    top: element.scrollTop,
    width: element.clientWidth,
    height: element.clientHeight,
    scrollWidth: Math.max(element.scrollWidth, fallbackWidth),
    scrollHeight: Math.max(element.scrollHeight, fallbackHeight),
  };
}

function isSameBoardViewport(current: BoardViewport | null, next: BoardViewport) {
  if (!current) return false;
  return (
    current.left === next.left &&
    current.top === next.top &&
    current.width === next.width &&
    current.height === next.height &&
    current.scrollWidth === next.scrollWidth &&
    current.scrollHeight === next.scrollHeight
  );
}

function describeBoardPosition(position: BoardNodePosition, canvasWidth: number, canvasHeight: number) {
  const safeWidth = Math.max(BOARD_CARD_WIDTH + BOARD_CANVAS_PADDING * 2, canvasWidth);
  const safeHeight = Math.max(BOARD_MIN_HEIGHT, canvasHeight);
  const xRatio = Math.min(0.999, Math.max(0, position.x / safeWidth));
  const yRatio = Math.min(0.999, Math.max(0, position.y / safeHeight));
  const column =
    xRatio < 1 / 3 ? "左列" : xRatio < 2 / 3 ? "中列" : "右列";
  const row =
    yRatio < 1 / 3 ? "上段" : yRatio < 2 / 3 ? "中段" : "下段";
  return `${column} · ${row}`;
}

function snapToBoardGuides(input: {
  nodeId: number;
  position: BoardNodePosition;
  nodes: NodeItem[];
  boardPositions: Record<number, BoardNodePosition>;
  canvasWidth: number;
  canvasHeight: number;
}) {
  const { nodeId, position, nodes, boardPositions, canvasWidth, canvasHeight } = input;
  const activeNode = nodes.find((item) => item.id === nodeId) ?? null;
  let nextPosition = clampBoardPosition(position, canvasWidth, canvasHeight);
  const guides: BoardGuide[] = [];

  const snapAxis = (value: number, candidates: Array<{ value: number; label: string }>) => {
    let snappedValue = value;
    let snappedLabel: string | null = null;
    let smallestDistance = BOARD_SNAP_THRESHOLD + 1;
    for (const candidate of candidates) {
      const distance = Math.abs(value - candidate.value);
      if (distance <= BOARD_SNAP_THRESHOLD && distance < smallestDistance) {
        snappedValue = candidate.value;
        snappedLabel = candidate.label;
        smallestDistance = distance;
      }
    }
    return {
      value: snappedValue,
      label: snappedLabel,
    };
  };

  const xCandidates: Array<{ value: number; label: string }> = [
    {
      value: Math.round((nextPosition.x - BOARD_CANVAS_PADDING) / BOARD_GRID_STEP) * BOARD_GRID_STEP + BOARD_CANVAS_PADDING,
      label: "落到稿格列",
    },
  ];
  const yCandidates: Array<{ value: number; label: string }> = [
    {
      value: Math.round((nextPosition.y - BOARD_CANVAS_PADDING) / BOARD_GRID_STEP) * BOARD_GRID_STEP + BOARD_CANVAS_PADDING,
      label: "落到稿格行",
    },
  ];

  nodes.forEach((node) => {
    if (node.id === nodeId) return;
    const position = boardPositions[node.id];
    if (!position) return;
    const nodeHeight = getNodeBoardHeight(node);
    xCandidates.push(
      { value: position.x, label: `对齐「${node.title}」左缘` },
      { value: position.x + BOARD_CARD_WIDTH + BOARD_COLUMN_GAP, label: `贴齐「${node.title}」右侧列` },
      { value: position.x - BOARD_CARD_WIDTH - BOARD_COLUMN_GAP, label: `贴齐「${node.title}」左侧列` },
    );
    yCandidates.push(
      { value: position.y, label: `对齐「${node.title}」顶线` },
      { value: position.y + nodeHeight + BOARD_ROW_GAP, label: `接在「${node.title}」下方` },
      { value: position.y - getNodeBoardHeight(activeNode ?? node) - BOARD_ROW_GAP, label: `贴近「${node.title}」上方` },
    );
  });

  const snappedX = snapAxis(nextPosition.x, xCandidates);
  const snappedY = snapAxis(nextPosition.y, yCandidates);
  nextPosition = clampBoardPosition({ x: snappedX.value, y: snappedY.value }, canvasWidth, canvasHeight);

  if (snappedX.label) {
    guides.push({
      id: `x-${snappedX.value}`,
      orientation: "vertical",
      offset: snappedX.value + BOARD_CARD_WIDTH / 2,
      label: snappedX.label,
    });
  }
  if (snappedY.label) {
    guides.push({
      id: `y-${snappedY.value}`,
      orientation: "horizontal",
      offset: snappedY.value,
      label: snappedY.label,
    });
  }

  return {
    position: nextPosition,
    guides,
  };
}

export function ArticleOutlineClient({
  articleId,
  nodes,
  fragments,
  onChange,
}: {
  articleId: number;
  nodes: NodeItem[];
  fragments: FragmentOption[];
  onChange: () => Promise<void>;
}) {
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [draggedFragmentId, setDraggedFragmentId] = useState<number | null>(null);
  const [dragTargetNodeId, setDragTargetNodeId] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [editingNodeId, setEditingNodeId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingDescription, setEditingDescription] = useState("");
  const [savingNodeId, setSavingNodeId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<FragmentOption & { score?: number }>>([]);
  const [canvasView, setCanvasView] = useState<OutlineCanvasView>("board");
  const [boardLayoutPreset, setBoardLayoutPreset] = useState<BoardLayoutPreset | "free">("balance");
  const [boardPositions, setBoardPositions] = useState<Record<number, BoardNodePosition>>({});
  const [freeBoardPositions, setFreeBoardPositions] = useState<Record<number, BoardNodePosition>>({});
  const [selectedBoardNodeId, setSelectedBoardNodeId] = useState<number | null>(null);
  const [activeBoardDrag, setActiveBoardDrag] = useState<{
    nodeId: number;
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [boardGuides, setBoardGuides] = useState<BoardGuide[]>([]);
  const [boardDropEcho, setBoardDropEcho] = useState<BoardDropEcho | null>(null);
  const [boardAnnouncement, setBoardAnnouncement] = useState("");
  const [boardViewport, setBoardViewport] = useState<BoardViewport | null>(null);
  const [activeMinimapViewportDrag, setActiveMinimapViewportDrag] = useState<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const boardCanvasRef = useRef<HTMLDivElement>(null);
  const boardMinimapRef = useRef<HTMLDivElement>(null);
  const boardNodeRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const boardPositionsRef = useRef<Record<number, BoardNodePosition>>({});
  const boardGuidesRef = useRef<BoardGuide[]>([]);
  const dragRafRef = useRef<number | null>(null);
  const pendingPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const minimapDragRafRef = useRef<number | null>(null);
  const pendingMinimapPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const dropEchoTimerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      setSearchResults([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch("/api/assets/fragments/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: trimmedQuery }),
        });
        const json = await response.json();
        if (response.ok && json.success) {
          setSearchResults(json.data);
        }
      } finally {
        setSearching(false);
      }
    }, 220);

    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const fragmentPool = useMemo(
    () => (searchQuery.trim() ? searchResults : fragments),
    [fragments, searchQuery, searchResults],
  );
  const attachedFragmentIds = useMemo(
    () => new Set(nodes.flatMap((node) => node.fragments.map((fragment) => fragment.id))),
    [nodes],
  );
  const totalAttachedCount = useMemo(
    () => nodes.reduce((sum, node) => sum + node.fragments.length, 0),
    [nodes],
  );
  const sharedFragmentCount = useMemo(
    () => fragmentPool.filter((fragment) => fragment.shared).length,
    [fragmentPool],
  );
  const outlineInspirations = useMemo(() => {
    const fragmentCards = pickSeededItems(
      fragmentPool
        .filter((fragment) => !attachedFragmentIds.has(fragment.id) && String(fragment.distilledContent || "").trim())
        .map((fragment) => ({
          key: `fragment-${fragment.id}`,
          title: fragment.title ? `待挂素材 · ${fragment.title}` : `待挂素材 · 片段 ${fragment.id}`,
          detail: String(fragment.distilledContent || "").trim(),
          meta: fragment.shared ? "来自共用素材池" : "来自当前稿件素材池",
        })),
      2,
      `${articleId}:${searchQuery}:fragment`,
    );
    const classicCards = pickSeededItems(OUTLINE_CLASSIC_OPENING_PATTERNS, 2, `${articleId}:${searchQuery}:classic`).map((item, index) => ({
      key: `classic-${index}-${item.title}`,
      title: `经典起手法 · ${item.title}`,
      detail: item.detail,
      meta: "适合先长出第一张节点卡",
    }));
    return [...fragmentCards, ...classicCards].slice(0, 4);
  }, [articleId, attachedFragmentIds, fragmentPool, searchQuery]);
  const boardCanvasHeight = useMemo(() => {
    const furthestNodeBottom = nodes.reduce((maxValue, node, index) => {
      const fallbackY = BOARD_CANVAS_PADDING + Math.floor(index / 2) * 260;
      const position = boardPositions[node.id];
      const fragmentOverflow = Math.max(0, node.fragments.length - 2) * 28;
      const bottom = (position?.y ?? fallbackY) + BOARD_CARD_HEIGHT + fragmentOverflow;
      return Math.max(maxValue, bottom);
    }, BOARD_MIN_HEIGHT);
    return Math.max(BOARD_MIN_HEIGHT, furthestNodeBottom + BOARD_CANVAS_PADDING);
  }, [boardPositions, nodes]);
  const boardCanvasWidth = useMemo(() => {
    const furthestNodeRight = nodes.reduce((maxValue, node, index) => {
      const fallbackX = BOARD_CANVAS_PADDING + (index % 2) * (BOARD_CARD_WIDTH + BOARD_COLUMN_GAP);
      const position = boardPositions[node.id];
      const right = (position?.x ?? fallbackX) + BOARD_CARD_WIDTH;
      return Math.max(maxValue, right);
    }, getBoardCanvasWidth(boardCanvasRef.current?.clientWidth));
    return Math.max(
      getBoardCanvasWidth(boardCanvasRef.current?.clientWidth),
      furthestNodeRight + BOARD_CANVAS_PADDING,
    );
  }, [boardPositions, nodes]);
  const boardMinimapMetrics = useMemo(() => {
    const scale = Math.min(
      BOARD_MINIMAP_MAX_WIDTH / Math.max(boardCanvasWidth, 1),
      BOARD_MINIMAP_MAX_HEIGHT / Math.max(boardCanvasHeight, 1),
    );
    return {
      width: Math.max(132, Math.round(boardCanvasWidth * scale)),
      height: Math.max(104, Math.round(boardCanvasHeight * scale)),
    };
  }, [boardCanvasHeight, boardCanvasWidth]);
  const boardViewportIndicator = useMemo(() => {
    if (!boardViewport) return null;
    const width = Math.min(
      boardMinimapMetrics.width,
      Math.max(18, (boardViewport.width / Math.max(boardViewport.scrollWidth, 1)) * boardMinimapMetrics.width),
    );
    const height = Math.min(
      boardMinimapMetrics.height,
      Math.max(14, (boardViewport.height / Math.max(boardViewport.scrollHeight, 1)) * boardMinimapMetrics.height),
    );
    const maxScrollLeft = Math.max(0, boardViewport.scrollWidth - boardViewport.width);
    const maxScrollTop = Math.max(0, boardViewport.scrollHeight - boardViewport.height);
    const maxLeft = Math.max(0, boardMinimapMetrics.width - width);
    const maxTop = Math.max(0, boardMinimapMetrics.height - height);

    return {
      width,
      height,
      left: maxScrollLeft > 0 ? (boardViewport.left / maxScrollLeft) * maxLeft : 0,
      top: maxScrollTop > 0 ? (boardViewport.top / maxScrollTop) * maxTop : 0,
      maxLeft,
      maxTop,
      maxScrollLeft,
      maxScrollTop,
    };
  }, [boardMinimapMetrics.height, boardMinimapMetrics.width, boardViewport]);

  useEffect(() => {
    const defaults = buildDefaultBoardPositions(nodes, boardCanvasRef.current?.clientWidth);
    if (typeof window === "undefined") {
      setBoardPositions(defaults);
      setFreeBoardPositions(defaults);
      return;
    }
    const storageKey = getBoardLayoutStorageKey(articleId);
    try {
      const rawValue = window.localStorage.getItem(storageKey);
      if (!rawValue) {
        setBoardPositions(defaults);
        setFreeBoardPositions(defaults);
        return;
      }
      const parsedValue = JSON.parse(rawValue) as
        | Record<string, BoardNodePosition>
        | {
            positions?: Record<string, BoardNodePosition>;
            freePositions?: Record<string, BoardNodePosition>;
            preset?: BoardLayoutPreset | "free";
          };
      const hasEnvelope = typeof parsedValue === "object" && parsedValue !== null && ("positions" in parsedValue || "preset" in parsedValue || "freePositions" in parsedValue);
      const savedPreset = hasEnvelope && typeof parsedValue.preset === "string" ? parsedValue.preset : "balance";
      const mergedFreePositions = sanitizeBoardPositions(nodes, hasEnvelope ? parsedValue.freePositions : parsedValue, defaults);
      const mergedPositions = sanitizeBoardPositions(nodes, hasEnvelope ? parsedValue.positions : parsedValue, defaults);
      setBoardLayoutPreset(savedPreset === "free" || savedPreset === "focus" || savedPreset === "balance" || savedPreset === "spread" ? savedPreset : "balance");
      setFreeBoardPositions(mergedFreePositions);
      setBoardPositions(savedPreset === "free" ? mergedFreePositions : mergedPositions);
    } catch {
      setBoardPositions(defaults);
      setFreeBoardPositions(defaults);
    }
  }, [articleId, nodes]);

  useEffect(() => {
    if (typeof window === "undefined" || Object.keys(boardPositions).length === 0) {
      return;
    }
    window.localStorage.setItem(
      getBoardLayoutStorageKey(articleId),
      JSON.stringify({
        preset: boardLayoutPreset,
        positions: boardPositions,
        freePositions: freeBoardPositions,
      }),
    );
  }, [articleId, boardLayoutPreset, boardPositions, freeBoardPositions]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const savedValue = window.localStorage.getItem(getBoardSoundStorageKey());
    if (savedValue === "off") {
      setSoundEnabled(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(getBoardSoundStorageKey(), soundEnabled ? "on" : "off");
  }, [soundEnabled]);

  useEffect(() => {
    boardPositionsRef.current = boardPositions;
  }, [boardPositions]);

  useEffect(() => {
    if (canvasView !== "board") {
      setBoardViewport(null);
      return;
    }
    const canvasElement = boardCanvasRef.current;
    if (!canvasElement) return;

    let frameId: number | null = null;
    const syncViewport = () => {
      frameId = null;
      const nextViewport = buildBoardViewportSnapshot(canvasElement, boardCanvasWidth, boardCanvasHeight);
      setBoardViewport((current) => (isSameBoardViewport(current, nextViewport) ? current : nextViewport));
    };
    const queueViewportSync = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(syncViewport);
    };

    syncViewport();
    canvasElement.addEventListener("scroll", queueViewportSync, { passive: true });
    window.addEventListener("resize", queueViewportSync);

    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          queueViewportSync();
        })
      : null;
    resizeObserver?.observe(canvasElement);

    return () => {
      canvasElement.removeEventListener("scroll", queueViewportSync);
      window.removeEventListener("resize", queueViewportSync);
      resizeObserver?.disconnect();
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [boardCanvasHeight, boardCanvasWidth, canvasView]);

  useEffect(() => {
    if (nodes.length === 0) {
      setSelectedBoardNodeId(null);
      return;
    }
    setSelectedBoardNodeId((current) => {
      if (current && nodes.some((node) => node.id === current)) {
        return current;
      }
      return nodes[0]?.id ?? null;
    });
  }, [nodes]);

  useEffect(() => {
    boardGuidesRef.current = boardGuides;
  }, [boardGuides]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => {
      mediaQuery.removeEventListener("change", updatePreference);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (dropEchoTimerRef.current !== null) {
        window.clearTimeout(dropEchoTimerRef.current);
      }
    };
  }, []);

  function triggerBoardDropEcho(nodeId: number, label: string) {
    if (dropEchoTimerRef.current !== null) {
      window.clearTimeout(dropEchoTimerRef.current);
    }
    setBoardDropEcho({
      nodeId,
      label,
      stamp: Date.now(),
    });
    dropEchoTimerRef.current = window.setTimeout(() => {
      setBoardDropEcho((current) => (current?.nodeId === nodeId ? null : current));
      dropEchoTimerRef.current = null;
    }, 1200);
  }

  function announceBoardAction(message: string) {
    setBoardAnnouncement("");
    window.setTimeout(() => {
      setBoardAnnouncement(message);
    }, 10);
  }

  function playBoardPlacementTone(intensity: number) {
    if (!soundEnabled || prefersReducedMotion || typeof window === "undefined" || typeof window.AudioContext === "undefined") {
      return;
    }
    const context = audioContextRef.current ?? new window.AudioContext();
    audioContextRef.current = context;
    if (context.state === "suspended") {
      void context.resume();
    }
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const overtone = context.createOscillator();
    const gainNode = context.createGain();
    const filter = context.createBiquadFilter();

    oscillator.type = "triangle";
    overtone.type = "sine";
    oscillator.frequency.setValueAtTime(520 + intensity * 28, now);
    overtone.frequency.setValueAtTime(880 + intensity * 40, now);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2200, now);

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(0.045, now + 0.012);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

    oscillator.connect(filter);
    overtone.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(context.destination);

    oscillator.start(now);
    overtone.start(now);
    oscillator.stop(now + 0.12);
    overtone.stop(now + 0.1);
  }

  function applyBoardPlacement(nodeId: number, rawPosition: BoardNodePosition, fallbackLabel: string) {
    const canvasElement = boardCanvasRef.current;
    if (!canvasElement) return;
    const activeNode = nodes.find((node) => node.id === nodeId);
    const activeNodeHeight = activeNode ? getNodeBoardHeight(activeNode) : BOARD_CARD_HEIGHT;
    const nextCanvasWidth = Math.max(boardCanvasWidth, rawPosition.x + BOARD_CARD_WIDTH + BOARD_CANVAS_PADDING);
    const nextCanvasHeight = Math.max(
      boardCanvasHeight,
      rawPosition.y + activeNodeHeight + BOARD_CANVAS_PADDING,
    );
    const snapped = snapToBoardGuides({
      nodeId,
      position: rawPosition,
      nodes,
      boardPositions: boardPositionsRef.current,
      canvasWidth: nextCanvasWidth,
      canvasHeight: nextCanvasHeight,
    });
    setBoardPositions((current) => ({
      ...current,
      [nodeId]: snapped.position,
    }));
    setBoardGuides(snapped.guides);
    const resolvedLabel = snapped.guides[0]?.label || fallbackLabel;
    triggerBoardDropEcho(nodeId, resolvedLabel);
    announceBoardAction(`节点已落位：${resolvedLabel}，当前位置 ${describeBoardPosition(snapped.position, nextCanvasWidth, nextCanvasHeight)}。`);
    setBoardLayoutPreset("free");
    setFreeBoardPositions((current) => ({
      ...current,
      [nodeId]: snapped.position,
    }));
    playBoardPlacementTone(Math.max(1, snapped.guides.length));
  }

  function applyBoardLayoutPreset(preset: BoardLayoutPreset) {
    const nextPositions = buildPresetBoardPositions(nodes, preset, boardCanvasRef.current?.clientWidth);
    setBoardPositions(nextPositions);
    setBoardLayoutPreset(preset);
    setBoardGuides([]);
    announceBoardAction(`白板已切换到${formatBoardPresetLabel(preset)}布局。`);
  }

  function restoreFreeBoardLayout() {
    const hasFreeLayout = Object.keys(freeBoardPositions).length > 0;
    if (!hasFreeLayout) return;
    setBoardPositions(freeBoardPositions);
    setBoardLayoutPreset("free");
    setBoardGuides([]);
    announceBoardAction("已恢复最近一次自由排布。");
  }

  function focusBoardNode(nodeId: number, reason: "chip" | "restore" = "chip") {
    const canvasElement = boardCanvasRef.current;
    const nodeElement = boardNodeRefs.current[nodeId];
    setSelectedBoardNodeId(nodeId);
    if (!canvasElement || !nodeElement) {
      return;
    }
    const targetLeft = Math.max(0, nodeElement.offsetLeft - (canvasElement.clientWidth - nodeElement.clientWidth) / 2);
    const targetTop = Math.max(0, nodeElement.offsetTop - (canvasElement.clientHeight - nodeElement.clientHeight) / 2);
    panBoardViewport(targetLeft, targetTop);
    const targetNode = nodes.find((item) => item.id === nodeId);
    if (reason === "chip" && targetNode) {
      const position = boardPositionsRef.current[nodeId];
      const locationLabel = position
        ? describeBoardPosition(position, boardCanvasWidth, boardCanvasHeight)
        : "当前可视区";
      announceBoardAction(`已定位到节点「${targetNode.title}」，当前位置 ${locationLabel}。`);
    }
  }

  function panBoardViewport(
    nextLeft: number,
    nextTop: number,
    behavior: ScrollBehavior = prefersReducedMotion ? "auto" : "smooth",
  ) {
    const canvasElement = boardCanvasRef.current;
    if (!canvasElement) return;
    const maxLeft = Math.max(0, boardCanvasWidth - canvasElement.clientWidth);
    const maxTop = Math.max(0, boardCanvasHeight - canvasElement.clientHeight);
    canvasElement.scrollTo({
      left: Math.min(Math.max(0, nextLeft), maxLeft),
      top: Math.min(Math.max(0, nextTop), maxTop),
      behavior,
    });
  }

  function panBoardViewportFromIndicator(indicatorLeft: number, indicatorTop: number, behavior: ScrollBehavior = "auto") {
    if (!boardViewportIndicator) return;
    const nextIndicatorLeft = Math.min(Math.max(0, indicatorLeft), boardViewportIndicator.maxLeft);
    const nextIndicatorTop = Math.min(Math.max(0, indicatorTop), boardViewportIndicator.maxTop);
    const nextScrollLeft = boardViewportIndicator.maxLeft > 0
      ? (nextIndicatorLeft / boardViewportIndicator.maxLeft) * boardViewportIndicator.maxScrollLeft
      : 0;
    const nextScrollTop = boardViewportIndicator.maxTop > 0
      ? (nextIndicatorTop / boardViewportIndicator.maxTop) * boardViewportIndicator.maxScrollTop
      : 0;
    panBoardViewport(nextScrollLeft, nextScrollTop, behavior);
  }

  useEffect(() => {
    if (!activeBoardDrag) return;

    const updateDragPosition = () => {
      const canvasElement = boardCanvasRef.current;
      const pointer = pendingPointerRef.current;
      dragRafRef.current = null;
      if (!canvasElement || !pointer) return;
      const canvasRect = canvasElement.getBoundingClientRect();
      const activeNode = nodes.find((node) => node.id === activeBoardDrag.nodeId);
      const rawPosition = {
        x: pointer.clientX - canvasRect.left + canvasElement.scrollLeft - activeBoardDrag.offsetX,
        y: pointer.clientY - canvasRect.top + canvasElement.scrollTop - activeBoardDrag.offsetY,
      };
      const snapped = snapToBoardGuides({
        nodeId: activeBoardDrag.nodeId,
        position: rawPosition,
        nodes,
        boardPositions: boardPositionsRef.current,
        canvasWidth: Math.max(boardCanvasWidth, rawPosition.x + BOARD_CARD_WIDTH + BOARD_CANVAS_PADDING),
        canvasHeight: Math.max(
          boardCanvasHeight,
          rawPosition.y + (activeNode ? getNodeBoardHeight(activeNode) : BOARD_CARD_HEIGHT) + BOARD_CANVAS_PADDING,
        ),
      });
      setBoardPositions((current) => ({
        ...current,
        [activeBoardDrag.nodeId]: snapped.position,
      }));
      setBoardGuides(snapped.guides);
    };

    const handlePointerMove = (event: PointerEvent) => {
      pendingPointerRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
      };
      if (dragRafRef.current !== null) return;
      dragRafRef.current = window.requestAnimationFrame(updateDragPosition);
    };

    const clearDragState = () => {
      if (dragRafRef.current !== null) {
        window.cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
      pendingPointerRef.current = null;
      setBoardGuides([]);
      setActiveBoardDrag(null);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (activeBoardDrag.pointerId !== event.pointerId) return;
      const canvasElement = boardCanvasRef.current;
      const pointer = pendingPointerRef.current ?? {
        clientX: event.clientX,
        clientY: event.clientY,
      };
      if (canvasElement) {
        const canvasRect = canvasElement.getBoundingClientRect();
        applyBoardPlacement(
          activeBoardDrag.nodeId,
          {
            x: pointer.clientX - canvasRect.left + canvasElement.scrollLeft - activeBoardDrag.offsetX,
            y: pointer.clientY - canvasRect.top + canvasElement.scrollTop - activeBoardDrag.offsetY,
          },
          "卡片落位",
        );
      }
      clearDragState();
    };

    const handlePointerCancel = (event: PointerEvent) => {
      if (activeBoardDrag.pointerId !== event.pointerId) return;
      clearDragState();
    };

    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      document.body.style.userSelect = "";
      if (dragRafRef.current !== null) {
        window.cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
      pendingPointerRef.current = null;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [activeBoardDrag, boardCanvasHeight, boardCanvasWidth, nodes, prefersReducedMotion]);

  useEffect(() => {
    if (!activeMinimapViewportDrag) return;

    const updateMinimapViewport = () => {
      minimapDragRafRef.current = null;
      const minimapElement = boardMinimapRef.current;
      const point = pendingMinimapPointerRef.current;
      if (!minimapElement || !point || !boardViewportIndicator) return;
      const bounds = minimapElement.getBoundingClientRect();
      panBoardViewportFromIndicator(
        point.clientX - bounds.left - activeMinimapViewportDrag.offsetX,
        point.clientY - bounds.top - activeMinimapViewportDrag.offsetY,
      );
    };

    const handlePointerMove = (event: PointerEvent) => {
      pendingMinimapPointerRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
      };
      if (minimapDragRafRef.current !== null) return;
      minimapDragRafRef.current = window.requestAnimationFrame(updateMinimapViewport);
    };

    const clearMinimapDragState = () => {
      if (minimapDragRafRef.current !== null) {
        window.cancelAnimationFrame(minimapDragRafRef.current);
        minimapDragRafRef.current = null;
      }
      pendingMinimapPointerRef.current = null;
      setActiveMinimapViewportDrag(null);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== activeMinimapViewportDrag.pointerId) return;
      clearMinimapDragState();
    };

    const handlePointerCancel = (event: PointerEvent) => {
      if (event.pointerId !== activeMinimapViewportDrag.pointerId) return;
      clearMinimapDragState();
    };

    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      document.body.style.userSelect = "";
      if (minimapDragRafRef.current !== null) {
        window.cancelAnimationFrame(minimapDragRafRef.current);
        minimapDragRafRef.current = null;
      }
      pendingMinimapPointerRef.current = null;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [activeMinimapViewportDrag, boardViewportIndicator]);

  async function addNode() {
    if (!newTitle.trim()) return;
    await fetch(`/api/articles/${articleId}/nodes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    setNewTitle("");
    await onChange();
  }

  async function moveNode(targetId: number) {
    if (!draggedId || draggedId === targetId) return;
    const order = [...nodes];
    const fromIndex = order.findIndex((node) => node.id === draggedId);
    const toIndex = order.findIndex((node) => node.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const [moved] = order.splice(fromIndex, 1);
    if (!moved) return;
    order.splice(toIndex, 0, moved);
    await fetch(`/api/articles/${articleId}/nodes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeIds: order.map((node) => node.id) }),
    });
    await onChange();
  }

  async function attachFragment(nodeId: number, fragmentId: number) {
    await fetch(`/api/articles/${articleId}/nodes/${nodeId}/fragments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fragmentId }),
    });
    await onChange();
  }

  async function detachFragment(nodeId: number, fragmentId: number) {
    await fetch(`/api/articles/${articleId}/nodes/${nodeId}/fragments?fragmentId=${fragmentId}`, {
      method: "DELETE",
    });
    await onChange();
  }

  async function deleteNode(nodeId: number) {
    await fetch(`/api/articles/${articleId}/nodes/${nodeId}`, { method: "DELETE" });
    await onChange();
  }

  function beginBoardDrag(event: React.PointerEvent<HTMLButtonElement>, nodeId: number) {
    const canvasElement = boardCanvasRef.current;
    if (!canvasElement || canvasView !== "board") return;
    const canvasRect = canvasElement.getBoundingClientRect();
    const currentPosition = boardPositions[nodeId] ?? buildDefaultBoardPositions(nodes, boardCanvasRef.current?.clientWidth)[nodeId] ?? { x: BOARD_CANVAS_PADDING, y: BOARD_CANVAS_PADDING };
    setActiveBoardDrag({
      nodeId,
      pointerId: event.pointerId,
      offsetX: event.clientX - canvasRect.left + canvasElement.scrollLeft - currentPosition.x,
      offsetY: event.clientY - canvasRect.top + canvasElement.scrollTop - currentPosition.y,
    });
    setBoardGuides([
      {
        id: `start-x-${nodeId}`,
        orientation: "vertical",
        offset: currentPosition.x + BOARD_CARD_WIDTH / 2,
        label: "当前列",
      },
      {
        id: `start-y-${nodeId}`,
        orientation: "horizontal",
        offset: currentPosition.y,
        label: "当前行",
      },
    ]);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function beginEdit(node: NodeItem) {
    setEditingNodeId(node.id);
    setEditingTitle(node.title);
    setEditingDescription(node.description || "");
  }

  function cancelEdit() {
    setEditingNodeId(null);
    setEditingTitle("");
    setEditingDescription("");
  }

  async function saveNode(nodeId: number) {
    setSavingNodeId(nodeId);
    await fetch(`/api/articles/${articleId}/nodes/${nodeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editingTitle.trim() || "未命名节点",
        description: editingDescription.trim() || null,
      }),
    });
    cancelEdit();
    setSavingNodeId(null);
    await onChange();
  }

  function renderFragmentChip(fragment: NodeFragmentItem, nodeId: number) {
    return (
      <div
        key={`${nodeId}-${fragment.id}`}
        className="group relative border border-lineStrong bg-surfaceHighlight px-3 py-3 text-xs leading-6 text-inkSoft shadow-sm transition-shadow hover:shadow"
      >
        <div className="flex items-start gap-2">
          <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cinnabar/50" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="truncate font-medium text-ink">{fragment.title || `素材 #${fragment.id}`}</div>
              {fragment.shared ? (
                <span className="border border-lineStrong bg-surface px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-inkMuted">
                  共用
                </span>
              ) : null}
            </div>
            <div className="mt-1 line-clamp-3 text-inkMuted">{fragment.distilledContent}</div>
          </div>
          <button
            type="button"
            onClick={() => {
              void detachFragment(nodeId, fragment.id);
            }}
            className="text-inkMuted opacity-0 transition-opacity hover:text-cinnabar group-hover:opacity-100"
            title="移除素材"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
      </div>
    );
  }

  function renderNodeCard(node: NodeItem, view: OutlineCanvasView) {
    const isBoard = view === "board";
    const availableFragments = fragmentPool.filter((fragment) => !node.fragments.some((item) => item.id === fragment.id));
    const boardPosition = boardPositions[node.id];
    const boardPositionLabel = isBoard && boardPosition
      ? describeBoardPosition(
        boardPosition,
        getBoardCanvasWidth(boardCanvasRef.current?.clientWidth),
        boardCanvasHeight,
      )
      : null;

    return (
      <article
        draggable={!isBoard}
        onDragStart={() => {
          if (!isBoard && !draggedFragmentId) setDraggedId(node.id);
        }}
        onDragEnd={() => {
          setDraggedId(null);
          setDragTargetNodeId(null);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (draggedFragmentId) setDragTargetNodeId(node.id);
        }}
        onDragLeave={() => {
          if (draggedFragmentId) setDragTargetNodeId(null);
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (draggedFragmentId) {
            void attachFragment(node.id, draggedFragmentId);
            setDraggedFragmentId(null);
            setDragTargetNodeId(null);
            return;
          }
          if (draggedId) {
            void moveNode(node.id);
            setDraggedId(null);
          }
        }}
        className={`border transition-all ${
          dragTargetNodeId === node.id
            ? "border-cinnabar bg-surfaceWarning shadow-[0_0_0_1px_rgba(167,48,50,0.08)]"
            : isBoard
              ? selectedBoardNodeId === node.id
                ? "h-full border-cinnabar bg-surfaceHighlight shadow-[0_14px_32px_rgba(167,48,50,0.12)]"
                : "h-full border-lineStrong bg-surface shadow-sm hover:shadow-md"
              : "border-lineStrong bg-surface"
        }`}
      >
        <div className={isBoard ? "p-4" : "p-4"}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-serifCn text-xl text-ink text-balance">{node.title}</div>
                <span className="border border-lineStrong bg-surfaceWarm px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-inkMuted">
                  节点 {node.sortOrder}
                </span>
                <span className="border border-lineStrong bg-surfaceWarm px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-inkMuted">
                  素材 {node.fragments.length}
                </span>
                {boardPositionLabel ? (
                  <span className="border border-warning/40 bg-surfaceWarning px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-warning">
                    {boardPositionLabel}
                  </span>
                ) : null}
              </div>
              <div className="mt-2 text-xs leading-6 text-inkMuted">
                {draggedFragmentId
                  ? "拖一条素材到这张卡上，直接完成挂载。"
                  : boardPositionLabel
                    ? `当前卡位落在${boardPositionLabel}，可继续拖动调整位置。`
                    : "这张节点卡代表一段判断或一个章节推进位。"}
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-inkMuted">
              {isBoard ? (
                <button
                  type="button"
                  aria-label={`拖动节点 ${node.title}`}
                  onPointerDown={(event) => beginBoardDrag(event, node.id)}
                  title="拖动排布"
                  className={`cursor-grab border border-lineStrong bg-surfaceWarm px-2 py-1 text-[11px] uppercase tracking-[0.16em] text-inkMuted active:cursor-grabbing ${
                    activeBoardDrag?.nodeId === node.id ? "border-cinnabar text-cinnabar" : ""
                  }`}
                >
                  排布
                </button>
              ) : null}
              <button type="button" onClick={() => beginEdit(node)} className="hover:text-cinnabar">
                编辑
              </button>
              <button
                type="button"
                onClick={() => {
                  void deleteNode(node.id);
                }}
                className="hover:text-cinnabar"
              >
                删除
              </button>
            </div>
          </div>

          {editingNodeId === node.id ? (
            <div className="mt-4 space-y-2 border border-lineStrong bg-surfaceWarm p-3">
              <input
                aria-label="节点标题"
                value={editingTitle}
                onChange={(event) => setEditingTitle(event.target.value)}
                className="w-full border border-lineStrong bg-surface px-3 py-2 text-sm text-ink"
              />
              <textarea
                aria-label="补充这个节点要写的事实、判断或写作提醒"
                value={editingDescription}
                onChange={(event) => setEditingDescription(event.target.value)}
                placeholder="补充这个节点要写的事实、判断或写作提醒"
                className="min-h-[88px] w-full border border-lineStrong bg-surface px-3 py-2 text-sm leading-7 text-ink"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void saveNode(node.id);
                  }}
                  disabled={savingNodeId === node.id}
                  className="bg-cinnabar px-3 py-2 text-xs text-white disabled:opacity-60"
                >
                  {savingNodeId === node.id ? "保存中…" : "保存节点"}
                </button>
                <button type="button" onClick={cancelEdit} className="border border-lineStrong bg-surface px-3 py-2 text-xs text-inkSoft">
                  取消
                </button>
              </div>
            </div>
          ) : node.description ? (
            <div className="mt-4 border border-line bg-surfaceWarm px-3 py-3 text-sm leading-7 text-inkSoft">
              {node.description}
            </div>
          ) : (
            <div className="mt-4 border border-dashed border-line px-3 py-3 text-sm leading-7 text-inkMuted">
              这个节点还没有写作说明。点击“编辑”，补上这一段应该承接的事实和判断。
            </div>
          )}

          <div className="mt-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-inkMuted">挂载素材</div>
            {node.fragments.length > 0 ? (
              <div className="mt-3 space-y-2">
                {node.fragments.map((fragment) => renderFragmentChip(fragment, node.id))}
              </div>
            ) : (
              <div className="mt-3 border border-dashed border-line bg-surfaceHighlight px-3 py-3 text-sm leading-7 text-inkMuted">
                这张节点卡还没有挂载素材。可以从左侧拖进来，或直接在下方选择已有素材。
              </div>
            )}
          </div>

          <div className="mt-4">
            <select
              aria-label="挂载素材到该节点"
              value=""
              onChange={(event) => {
                const fragmentId = Number(event.target.value);
                if (fragmentId) {
                  void attachFragment(node.id, fragmentId);
                }
              }}
              className="w-full border border-lineStrong bg-surfaceWarm px-3 py-2 text-xs text-inkSoft"
            >
              <option value="">挂载已有素材到该节点</option>
              {availableFragments.map((fragment) => (
                <option key={fragment.id} value={fragment.id}>
                  {fragment.title ? `${fragment.title} · ` : ""}
                  {fragment.distilledContent.slice(0, 34)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </article>
    );
  }

  return (
    <div className="space-y-4">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {boardAnnouncement}
      </div>
      <div className="border border-lineStrong bg-[radial-gradient(circle_at_top_left,rgba(196,138,58,0.12),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.88)_0%,var(--paper-strong)_100%)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-cinnabar">检字白板</div>
            <div className="mt-2 font-serifCn text-2xl text-ink text-balance">把素材拖进节点卡，先完成拆解与拼接，再追求完整成稿。</div>
            <div className="mt-2 text-sm leading-7 text-inkSoft">
              这块面板默认按白板方式组织大纲和素材，保留拖拽重排，但弱化“管理后台”感。需要逐条核对时，再切回清单。
            </div>
          </div>
          <div className="flex overflow-hidden border border-lineStrong bg-surface">
            {([
              ["board", "白板视图"],
              ["list", "清单视图"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setCanvasView(value)}
                className={`px-4 py-2 text-sm transition-colors ${
                  canvasView === value
                    ? "bg-cinnabar text-white"
                    : "text-inkSoft hover:bg-surfaceWarm"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="border border-lineStrong bg-surface px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.16em] text-inkMuted">大纲节点</div>
            <div className="mt-2 font-serifCn text-3xl text-ink text-balance">{nodes.length}</div>
          </div>
          <div className="border border-lineStrong bg-surface px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.16em] text-inkMuted">已挂素材</div>
            <div className="mt-2 font-serifCn text-3xl text-ink text-balance">{totalAttachedCount}</div>
          </div>
          <div className="border border-lineStrong bg-surface px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.16em] text-inkMuted">素材池 / 共用</div>
            <div className="mt-2 font-serifCn text-3xl text-ink text-balance">
              {fragmentPool.length} / {sharedFragmentCount}
            </div>
          </div>
        </div>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-4 border border-lineStrong bg-surfaceWarm p-4">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">新建节点</div>
            <div className="mt-3 flex gap-2">
              <input
                aria-label="新增大纲节点"
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void addNode();
                  }
                }}
                placeholder="新增大纲节点"
                className="min-w-0 flex-1 border border-lineStrong bg-surface px-3 py-2 text-sm text-ink"
              />
              <button type="button" onClick={() => void addNode()} className="bg-cinnabar px-3 py-2 text-sm text-white">
                添加
              </button>
            </div>
            <div className="mt-2 text-xs leading-6 text-inkMuted">
              先写一个段落标题，再慢慢往里塞事实、判断和反直觉点。
            </div>
          </div>

          <div className="border border-lineStrong bg-surface px-3 py-3">
            <div className="text-[11px] uppercase tracking-[0.18em] text-inkMuted">语义召回</div>
            <input
              aria-label="搜观点、时间、人物或事件，不必完全匹配原文"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜观点、时间、人物或事件，不必完全匹配原文"
              className="mt-2 w-full border border-lineStrong bg-surface px-3 py-2 text-sm text-ink"
            />
            <div className="mt-2 text-xs leading-6 text-inkMuted">
              {searchQuery.trim()
                ? searching
                  ? "正在按语义相近度重排素材…"
                  : `当前召回 ${fragmentPool.length} 条素材，可直接拖进右侧节点卡。`
                : "留空时展示最近素材；输入后会按语义相近度优先显示候选。"}
            </div>
          </div>

          <div className="border border-lineStrong bg-surface px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-inkMuted">活字匣</div>
              <span className="text-[11px] text-inkMuted">未挂载 {fragmentPool.filter((fragment) => !attachedFragmentIds.has(fragment.id)).length} 条</span>
            </div>
            {fragmentPool.length > 0 ? (
              <div className="mt-3 grid max-h-[480px] gap-2 overflow-y-auto pr-1">
                {fragmentPool.map((fragment) => {
                  const attached = attachedFragmentIds.has(fragment.id);
                  return (
                    <div
                      key={fragment.id}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("fragmentId", String(fragment.id));
                        setDraggedFragmentId(fragment.id);
                      }}
                      onDragEnd={() => setDraggedFragmentId(null)}
                      className={`cursor-move overflow-hidden border px-3 py-3 text-xs leading-6 shadow-sm transition-all ${
                        attached
                          ? "border-line bg-surfaceMuted text-inkMuted"
                          : "border-lineStrong bg-surfaceHighlight text-inkSoft hover:-translate-y-0.5 hover:border-warning hover:shadow-md"
                      }`}
                      title={fragment.distilledContent}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-ink">{fragment.title || "未命名片段"}</div>
                          <div className="mt-1 line-clamp-4 opacity-90">{fragment.distilledContent}</div>
                        </div>
                        <div className="space-y-1 text-[10px] uppercase tracking-[0.16em] text-inkMuted">
                          {fragment.shared ? <div>共用</div> : null}
                          {attached ? <div>已挂</div> : <div>待挂</div>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 border border-dashed border-line bg-surfaceHighlight px-3 py-3 text-sm leading-7 text-inkMuted">
                {searchQuery.trim() ? "当前检索没有命中素材，换个关键词再试。" : "素材池暂时为空，先去证据区补几条材料。"}
              </div>
            )}
          </div>
        </aside>

        <section className="min-w-0 border border-lineStrong bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">
                {canvasView === "board" ? "白板区" : "清单区"}
              </div>
              <div className="mt-2 text-sm leading-7 text-inkSoft">
                {canvasView === "board"
                  ? "更适合先看节点之间的空隙、素材分布和段落重量。拖动画布上的节点卡可自由排布，拖素材可直接挂载。"
                  : "更适合逐条核对节点说明和素材挂载情况。"}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canvasView === "board" ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setSoundEnabled((current) => {
                        const nextValue = !current;
                        announceBoardAction(nextValue ? "白板落位声已开启。" : "白板落位声已关闭。");
                        return nextValue;
                      })}
                    aria-pressed={soundEnabled}
                    className={`border px-3 py-2 text-xs ${
                      soundEnabled
                        ? "border-cinnabar bg-surfaceWarning text-cinnabar"
                        : "border-lineStrong bg-surfaceWarm text-inkSoft"
                    }`}
                  >
                    {soundEnabled ? "落位声：开" : "落位声：关"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBoardPositions(buildDefaultBoardPositions(nodes, boardCanvasRef.current?.clientWidth));
                      setBoardLayoutPreset("balance");
                      announceBoardAction("白板卡位已重新整理。");
                    }}
                    className="border border-lineStrong bg-surfaceWarm px-3 py-2 text-xs text-inkSoft"
                  >
                    重新整理卡位
                  </button>
                </>
              ) : null}
              <div className="text-xs leading-6 text-inkMuted">
                {draggedFragmentId
                  ? "正在拖动素材，松手即可挂到目标节点。"
                  : draggedId
                    ? "正在拖动节点，松手即可重排顺序。"
                    : canvasView === "board"
                      ? "按住每张卡右上角“排布”即可自由挪动。"
                      : "提示：拖得越少，结构越清楚。"}
              </div>
            </div>
          </div>
          {canvasView === "board" ? (
            <div className="mt-3 border border-lineStrong bg-surfaceHighlight px-3 py-3 text-xs leading-6 text-inkMuted">
              白板提示：拖动节点右上角“排布”手柄即可自由挪动位置，落位后会同步播报方位结果。
            </div>
          ) : null}
          {canvasView === "board" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {([
                ["focus", "聚焦纵列"],
                ["balance", "双列平衡"],
                ["spread", "展开铺陈"],
              ] as const).map(([preset, label]) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => applyBoardLayoutPreset(preset)}
                  className={`border px-3 py-2 text-xs ${
                    boardLayoutPreset === preset
                      ? "border-cinnabar bg-surfaceWarning text-cinnabar"
                      : "border-lineStrong bg-surface text-inkSoft"
                  }`}
                >
                  {label}
                </button>
              ))}
              {boardLayoutPreset === "free" ? (
                <span className="border border-warning/40 bg-surfaceWarning px-3 py-2 text-xs text-warning">当前为自由排布</span>
              ) : null}
              <button
                type="button"
                onClick={restoreFreeBoardLayout}
                disabled={Object.keys(freeBoardPositions).length === 0 || boardLayoutPreset === "free"}
                className="border border-lineStrong bg-surface px-3 py-2 text-xs text-inkSoft disabled:opacity-50"
              >
                恢复自由排布
              </button>
            </div>
          ) : null}
          {canvasView === "board" && nodes.length > 0 ? (
            <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
              <div className="min-w-0 border border-lineStrong bg-surface px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-inkMuted">画布总览</div>
                    <div className="mt-2 text-xs leading-6 text-inkMuted">
                      点空白可跳转视口，点字块可直接定位到对应节点，拖动画框可细调当前观察区。
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => panBoardViewport(0, 0)}
                    className="border border-lineStrong bg-surfaceWarm px-3 py-2 text-[11px] text-inkSoft"
                  >
                    回到左上
                  </button>
                </div>
                <div
                  ref={boardMinimapRef}
                  role="presentation"
                  onClick={(event) => {
                    const bounds = event.currentTarget.getBoundingClientRect();
                    const targetX = ((event.clientX - bounds.left) / boardMinimapMetrics.width) * boardCanvasWidth;
                    const targetY = ((event.clientY - bounds.top) / boardMinimapMetrics.height) * boardCanvasHeight;
                    const viewportWidth = boardViewport?.width ?? 0;
                    const viewportHeight = boardViewport?.height ?? 0;
                    panBoardViewport(targetX - viewportWidth / 2, targetY - viewportHeight / 2);
                    announceBoardAction(`白板视口已跳转到 ${describeBoardPosition({ x: targetX, y: targetY }, boardCanvasWidth, boardCanvasHeight)}。`);
                  }}
                  className="mt-3 relative overflow-hidden border border-dashed border-warning/40 bg-[linear-gradient(transparent_15px,rgba(140,107,75,0.06)_16px)] bg-[length:100%_16px]"
                  style={{
                    width: `${boardMinimapMetrics.width}px`,
                    height: `${boardMinimapMetrics.height}px`,
                  }}
                >
                  {nodes.map((node) => {
                    const position = boardPositions[node.id];
                    const markerLeft = ((position?.x ?? BOARD_CANVAS_PADDING) / boardCanvasWidth) * boardMinimapMetrics.width;
                    const markerTop = ((position?.y ?? BOARD_CANVAS_PADDING) / boardCanvasHeight) * boardMinimapMetrics.height;
                    const markerWidth = Math.max(18, (BOARD_CARD_WIDTH / boardCanvasWidth) * boardMinimapMetrics.width);
                    const markerHeight = Math.max(12, (getNodeBoardHeight(node) / boardCanvasHeight) * boardMinimapMetrics.height);
                    const selected = selectedBoardNodeId === node.id;
                    return (
                      <button
                        key={node.id}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          focusBoardNode(node.id);
                        }}
                        aria-label={`定位到节点 ${node.title}`}
                        title={node.title}
                        className={`absolute overflow-hidden border px-1 text-left text-[9px] leading-4 transition-colors ${
                          selected
                            ? "border-cinnabar bg-surfaceWarning text-cinnabar"
                            : "border-lineStrong bg-surface text-inkMuted hover:border-cinnabar/70 hover:text-cinnabar"
                        }`}
                        style={{
                          left: `${markerLeft}px`,
                          top: `${markerTop}px`,
                          width: `${markerWidth}px`,
                          height: `${markerHeight}px`,
                        }}
                      >
                        <span className="block truncate">{node.title}</span>
                      </button>
                    );
                  })}
                  {boardViewportIndicator ? (
                    <div
                      className="pointer-events-none absolute border-2 border-cinnabar/80 bg-cinnabar/10 shadow-[0_0_0_1px_rgba(167,48,50,0.06)]"
                      style={{
                        left: `${boardViewportIndicator.left}px`,
                        top: `${boardViewportIndicator.top}px`,
                        width: `${boardViewportIndicator.width}px`,
                        height: `${boardViewportIndicator.height}px`,
                      }}
                    >
                      <button
                        type="button"
                        aria-label="拖动画布视口"
                        onClick={(event) => {
                          event.stopPropagation();
                        }}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          const minimapBounds = boardMinimapRef.current?.getBoundingClientRect();
                          if (!minimapBounds) return;
                          setActiveMinimapViewportDrag({
                            pointerId: event.pointerId,
                            offsetX: event.clientX - minimapBounds.left - boardViewportIndicator.left,
                            offsetY: event.clientY - minimapBounds.top - boardViewportIndicator.top,
                          });
                        }}
                        className={`pointer-events-auto absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-cinnabar/60 bg-surface text-cinnabar shadow-sm transition-colors ${
                          activeMinimapViewportDrag ? "cursor-grabbing bg-surfaceWarning" : "cursor-grab hover:bg-surfaceHighlight"
                        }`}
                        style={{ touchAction: "none" }}
                      >
                        <span aria-hidden="true" className="text-base leading-none">◎</span>
                        <span className="sr-only">拖动画框以移动白板视口</span>
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.14em] text-inkMuted">
                  <span className="border border-lineStrong bg-surfaceWarm px-2 py-1">{nodes.length} 张节点卡</span>
                  <span className="border border-lineStrong bg-surfaceWarm px-2 py-1">画布 {Math.round(boardCanvasWidth)} × {Math.round(boardCanvasHeight)}</span>
                </div>
              </div>
              <div className="min-w-0 border border-lineStrong bg-surfaceHighlight px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-inkMuted">节点导航</div>
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {nodes.map((node) => {
                    const position = boardPositions[node.id];
                    const locationLabel = position
                      ? describeBoardPosition(position, boardCanvasWidth, boardCanvasHeight)
                      : "待定位";
                    const selected = selectedBoardNodeId === node.id;
                    return (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => focusBoardNode(node.id)}
                        className={`min-w-[180px] shrink-0 border px-3 py-3 text-left transition-colors ${
                          selected
                            ? "border-cinnabar bg-surfaceWarning"
                            : "border-lineStrong bg-surface hover:bg-surfaceWarm"
                        }`}
                      >
                        <div className="truncate text-sm font-medium text-ink">{node.title}</div>
                        <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-inkMuted">{locationLabel}</div>
                        <div className="mt-2 text-xs text-inkMuted">素材 {node.fragments.length}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
          {canvasView === "board" ? (
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-inkMuted">
              <span className="border border-lineStrong bg-surfaceWarm px-3 py-2">拖拽排布</span>
              <span className="border border-lineStrong bg-surfaceWarm px-3 py-2">节点导航</span>
              <span className="border border-lineStrong bg-surfaceWarm px-3 py-2">布局预设</span>
              <span className="border border-lineStrong bg-surfaceWarm px-3 py-2">缩略总览定位</span>
              <span className="border border-lineStrong bg-surfaceWarm px-3 py-2">吸附后会显示位置语义</span>
            </div>
          ) : null}

          {nodes.length === 0 ? (
            <div className="mt-4 flex min-h-[320px] flex-col items-center justify-center border border-dashed border-lineStrong bg-[linear-gradient(transparent_31px,rgba(140,107,75,0.05)_32px)] bg-[length:100%_32px] px-6 text-center">
              <div className="font-serifCn text-3xl text-inkMuted">白板还没有第一块字</div>
              <div className="mt-3 max-w-xl text-sm leading-7 text-inkMuted">
                从左侧写下一个节点标题，这里就会长出第一张卡。先定义段落，再决定每张卡该挂哪些素材，白纸焦虑会比直接写正文轻很多。
              </div>
              {outlineInspirations.length > 0 ? (
                <div className="mt-6 grid w-full max-w-4xl gap-3 text-left md:grid-cols-2">
                  {outlineInspirations.map((item) => (
                    <div key={item.key} className="border border-lineStrong bg-surface px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-cinnabar">{item.title}</div>
                      <div className="mt-3 text-sm leading-7 text-inkSoft">{item.detail}</div>
                      <div className="mt-3 text-xs leading-6 text-inkMuted">{item.meta}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : canvasView === "board" ? (
            <div
              ref={boardCanvasRef}
              className="mt-4 relative overflow-auto border border-dashed border-lineStrong bg-[radial-gradient(circle_at_top_left,rgba(196,138,58,0.10),transparent_28%),linear-gradient(transparent_31px,rgba(140,107,75,0.05)_32px)] bg-[length:100%_32px]"
              style={{
                height: `min(72vh, ${BOARD_VIEWPORT_MAX_HEIGHT}px)`,
                minHeight: `${Math.min(BOARD_VIEWPORT_MIN_HEIGHT, boardCanvasHeight)}px`,
              }}
            >
              <div
                className="relative min-h-full"
                style={{
                  width: `${boardCanvasWidth}px`,
                  height: `${boardCanvasHeight}px`,
                }}
              >
                {boardGuides.map((guide) => (
                  <div key={guide.id}>
                    <div
                      className={`pointer-events-none absolute z-0 ${
                        guide.orientation === "vertical"
                          ? "top-0 h-full w-px bg-cinnabar/40"
                          : "left-0 h-px w-full bg-cinnabar/40"
                      }`}
                      style={
                        guide.orientation === "vertical"
                          ? { left: `${guide.offset}px` }
                          : { top: `${guide.offset}px` }
                      }
                    />
                    <div
                      className="pointer-events-none absolute z-0 bg-cinnabar px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-white shadow-sm"
                      style={
                        guide.orientation === "vertical"
                          ? { left: `${guide.offset + 6}px`, top: "10px" }
                          : { left: "10px", top: `${guide.offset + 6}px` }
                      }
                    >
                      {guide.label}
                    </div>
                  </div>
                ))}
                {nodes.map((node, index) => {
                  const defaultPosition = {
                    x: BOARD_CANVAS_PADDING + (index % 2) * (BOARD_CARD_WIDTH + 28),
                    y: BOARD_CANVAS_PADDING + Math.floor(index / 2) * 260,
                  };
                  const position = boardPositions[node.id] ?? defaultPosition;
                  return (
                    <div
                      key={node.id}
                      ref={(element) => {
                        boardNodeRefs.current[node.id] = element;
                      }}
                      className={`absolute transition-[left,top,transform,box-shadow] duration-200 ease-out ${
                        activeBoardDrag?.nodeId === node.id
                          ? "z-20 -rotate-[0.6deg] scale-[1.01]"
                          : boardDropEcho?.nodeId === node.id
                            ? "z-20 scale-[1.015]"
                            : selectedBoardNodeId === node.id
                              ? "z-20"
                              : "z-10"
                      }`}
                      style={{
                        left: `${position.x}px`,
                        top: `${position.y}px`,
                        width: `${BOARD_CARD_WIDTH}px`,
                      }}
                    >
                      {boardDropEcho?.nodeId === node.id ? (
                        <div
                          key={boardDropEcho.stamp}
                          className="pointer-events-none absolute -top-3 left-4 z-30 border border-cinnabar/20 bg-surfaceWarning px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-cinnabar shadow-[0_10px_24px_rgba(167,48,50,0.12)]"
                        >
                          {boardDropEcho.label}
                        </div>
                      ) : null}
                      {renderNodeCard(node, "board")}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {nodes.map((node) => (
                <div key={node.id}>
                  {renderNodeCard(node, "list")}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
