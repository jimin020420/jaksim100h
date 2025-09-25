import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, Plus, Trash2, Pencil, Check, X } from "lucide-react";

// ---- Types ----
type Project = {
  id: string;
  name: string;
  goal?: string;
  currentStatus?: string; // NEW: current status / 현재 상태 메모
  targetHours: number; // configurable, default 100
  elapsedMs: number; // accumulated elapsed time in ms (not including current run)
  isRunning: boolean;
  lastStartedAt?: number; // epoch ms when started
};

// ---- Utilities ----
const HOURS_TO_MS = (h: number) => Math.max(0, h) * 3600 * 1000;
const MS_TO_HMS = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

const STORAGE_KEY = "jaksim100h.projects.v1";

function useNow(tickMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return now;
}

function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

function saveProjects(projects: Project[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

// ---- Main Component ----
export default function Jaksim100HoursApp() {
  // --- PWA bootstrap: inject manifest & register Service Worker ---
  useEffect(() => {
    // Inject manifest link tag if not present
    const hasManifest = !!document.querySelector('link[rel="manifest"]');
    if (!hasManifest) {
      const link = document.createElement('link');
      link.rel = 'manifest';
      link.href = '/manifest.webmanifest';
      document.head.appendChild(link);
    }

    // Ensure theme-color is present for status bar coloring
    let theme = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!theme) {
      theme = document.createElement('meta');
      theme.name = 'theme-color';
      theme.content = '#4f46e5';
      document.head.appendChild(theme);
    }

    // Register the service worker (public/sw.js)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.error);
    }
  }, []);

  const now = useNow(1000);
  const [projects, setProjects] = useState<Project[]>(() => loadProjects());

  // Persist
  useEffect(() => {
    saveProjects(projects);
  }, [projects]);

  // ---- Local state for creating / editing ----
  const [form, setForm] = useState({ name: "", goal: "", currentStatus: "", targetHours: 100 });
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const addProject = () => {
    const name = form.name.trim();
    if (!name) {
      nameInputRef.current?.focus();
      return;
    }
    const newProject: Project = {
      id: crypto.randomUUID(),
      name,
      goal: form.goal.trim() || undefined,
      currentStatus: form.currentStatus.trim() || undefined,
      targetHours: Number(form.targetHours) || 100,
      elapsedMs: 0,
      isRunning: false,
      lastStartedAt: undefined,
    };
    setProjects((prev) => [newProject, ...prev]);
    setForm({ name: "", goal: "", currentStatus: "", targetHours: 100 });
    nameInputRef.current?.focus();
  };

  const deleteProject = (id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
  };

  const toggleRun = (id: string) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        if (p.isRunning) {
          // pause -> accumulate elapsed
          const nowTs = Date.now();
          const delta = p.lastStartedAt ? nowTs - p.lastStartedAt : 0;
          return {
            ...p,
            isRunning: false,
            lastStartedAt: undefined,
            elapsedMs: Math.max(0, p.elapsedMs + delta),
          };
        } else {
          // start -> set lastStartedAt
          return {
            ...p,
            isRunning: true,
            lastStartedAt: Date.now(),
          };
        }
      })
    );
  };

  const updateTargetHours = (id: string, targetHours: number) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, targetHours: Math.max(0, targetHours) } : p))
    );
  };

  const renameProject = (id: string, name: string) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
  };

  const setGoal = (id: string, goal: string) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, goal: goal || undefined } : p)));
  };

  const setCurrentStatus = (id: string, currentStatus: string) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, currentStatus: currentStatus || undefined } : p)));
  };

  // Compute derived values for display
  const viewProjects = useMemo(() => {
    return projects.map((p) => {
      const runtimeMs = p.isRunning && p.lastStartedAt ? now - p.lastStartedAt : 0;
      const effectiveElapsedMs = Math.max(0, p.elapsedMs + (runtimeMs > 0 ? runtimeMs : 0));
      const targetMs = HOURS_TO_MS(p.targetHours);
      const progress = targetMs > 0 ? Math.min(100, (effectiveElapsedMs / targetMs) * 100) : 0;
      return { ...p, effectiveElapsedMs, progress, targetMs };
    });
  }, [projects, now]);

  return (
    <div
      className="
      min-h-screen
      bg-white text-gray-900                       /* 라이트모드 강제 */
      px-4 sm:px-6
      pt-[calc(env(safe-area-inset-top)+12px)]    /* 노치 안전영역 + 여백 */
      pb-[calc(env(safe-area-inset-bottom)+16px)] /* 홈바 안전영역 */
    "
    >
      <div className="max-w-[600px] w-full mx-auto">      {/* 모바일 앱같은 폭 */}
        <header className="mb-4">
          <div className="text-center text-sm text-gray-600">
            {new Date().toLocaleDateString('ko-KR', {
              month: 'numeric',
              day: 'numeric',
              weekday: 'short',
            })}
          </div>
          <h1 className="text-[22px] md:text-3xl font-extrabold tracking-tight leading-[1.25] text-center mt-1">
            작심백시간
          </h1>
        </header>

        {/* Create Project Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5 mb-5">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Plus className="h-5 w-5" />
            새 프로젝트
          </h2>

          {/* 폰에서는 1열, md↑ 3열 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            {/* 이름 */}
            <input
              ref={nameInputRef}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="프로젝트명"
              className="
              w-full rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-500
              px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
              text-[16px]                                  /* iOS 포커스 확대 방지 */
            "
            />

            {/* 목표 */}
            <input
              value={form.goal}
              onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))}
              placeholder="이루고자 하는 목표 (선택)"
              className="
              w-full rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-500
              px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
              text-[16px]
            "
            />

            {/* 시간 목표 */}
            <div className="w-full">
              <label className="block text-sm text-gray-600 mb-1 md:mb-2">시간 목표</label>
              <div className="flex flex-col md:flex-row gap-2">
                <input
                  type="number"
                  min={0}
                  value={form.targetHours}
                  onChange={(e) => setForm((f) => ({ ...f, targetHours: Number(e.target.value) }))}
                  className="
                  w-full md:w-32 rounded-xl border border-gray-300 bg-white text-gray-900
                  px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
                  text-[16px]
                "
                />
                <span className="text-sm text-gray-600 md:self-center">시간(기본 100)</span>
              </div>
            </div>

            {/* 현재 상태 메모 */}
            <textarea
              value={form.currentStatus}
              onChange={(e) => setForm((f) => ({ ...f, currentStatus: e.target.value }))}
              placeholder="현재 상태 / 메모 (예: 현재 중급 수준, 30분 집중 유지 어려움)"
              className="
              md:col-span-3 w-full rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-500
              px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[72px]
              text-[16px]
            "
            />
          </div>

          <div className="flex md:justify-end">
            <button
              onClick={addProject}
              className="
              w-full md:w-auto h-11 px-4 rounded-xl bg-indigo-600 text-white text-[15px] font-semibold
              shadow-sm hover:bg-indigo-700 active:scale-[0.99] transition
            "
            >
              추가
            </button>
          </div>
        </div>

        {/* Projects List */}
        <div className="space-y-4">
          {viewProjects.length === 0 && (
            <div className="text-center text-gray-500">아직 프로젝트가 없어요. 위에서 추가해보세요!</div>
          )}

          {viewProjects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onToggleRun={() => toggleRun(p.id)}
              onDelete={() => deleteProject(p.id)}
              onRename={(name) => renameProject(p.id, name)}
              onSetGoal={(goal) => setGoal(p.id, goal)}
              onSetCurrentStatus={(v) => setCurrentStatus(p.id, v)}
              onSetTargetHours={(h) => updateTargetHours(p.id, h)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  onToggleRun,
  onDelete,
  onRename,
  onSetGoal,
  onSetCurrentStatus,
  onSetTargetHours,
}: {
  project: Project & { effectiveElapsedMs: number; progress: number; targetMs: number };
  onToggleRun: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
  onSetGoal: (goal: string) => void;
  onSetCurrentStatus: (v: string) => void;
  onSetTargetHours: (h: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [tempName, setTempName] = useState(project.name);
  const [tempGoal, setTempGoal] = useState(project.goal || "");
  const [tempStatus, setTempStatus] = useState(project.currentStatus || "");
  const [tempHours, setTempHours] = useState(project.targetHours);

  useEffect(() => {
    setTempName(project.name);
    setTempGoal(project.goal || "");
    setTempStatus(project.currentStatus || "");
    setTempHours(project.targetHours);
  }, [project.id]);

  const commitEdit = () => {
    onRename(tempName.trim() || project.name);
    onSetGoal(tempGoal.trim());
    onSetCurrentStatus(tempStatus.trim());
    onSetTargetHours(Number(tempHours) || 0);
    setEditing(false);
  };

  const cancelEdit = () => {
    setTempName(project.name);
    setTempGoal(project.goal || "");
    setTempStatus(project.currentStatus || "");
    setTempHours(project.targetHours);
    setEditing(false);
  };

  const remainingMs = Math.max(0, project.targetMs - project.effectiveElapsedMs);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5">
      {/* Top Row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {!editing ? (
            <>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-[16px] font-semibold truncate">{project.name}</h3>
                <button
                  className="p-1 rounded-lg hover:bg-gray-100"
                  onClick={() => setEditing(true)}
                  aria-label="편집"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
              {project.goal && (
                <p className="text-sm text-gray-600 break-words">목표: {project.goal}</p>
              )}
              {project.currentStatus && (
                <p className="text-sm text-gray-600 break-words mt-1">현재: {project.currentStatus}</p>
              )}
            </>
          ) : (
            <div className="grid md:grid-cols-3 gap-2 w-full">
              <input
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                className="rounded-xl border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input
                value={tempGoal}
                onChange={(e) => setTempGoal(e.target.value)}
                placeholder="목표 (선택)"
                className="rounded-xl border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={tempHours}
                  onChange={(e) => setTempHours(Number(e.target.value))}
                  className="w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-xs md:text-sm text-gray-600 whitespace-nowrap">시간 목표</span>
              </div>
              <textarea
                value={tempStatus}
                onChange={(e) => setTempStatus(e.target.value)}
                placeholder="현재 상태 / 메모"
                className="md:col-span-3 w-full rounded-xl border border-gray-300 bg-white text-gray-900 placeholder:text-gray-500 px-3 py-3 text-[15px] placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[88px]"
              />
              <div className="md:col-span-3 flex gap-2 justify-end">
                <button onClick={commitEdit} className="px-3 py-2 rounded-xl bg-emerald-600 text-white flex items-center gap-1">
                  <Check className="h-4 w-4" />저장
                </button>
                <button onClick={cancelEdit} className="px-3 py-2 rounded-xl bg-gray-200 text-gray-800 flex items-center gap-1">
                  <X className="h-4 w-4" />취소
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onToggleRun}
            className={`px-3 py-2 rounded-xl text-white shadow flex items-center gap-2 ${project.isRunning ? "bg-rose-600 hover:bg-rose-700" : "bg-indigo-600 hover:bg-indigo-700"
              }`}
          >
            {project.isRunning ? <><Pause className="h-4 w-4" />일시정지</> : <><Play className="h-4 w-4" />시작</>}
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-2 rounded-xl bg-gray-100 text-gray-800 hover:bg-gray-200 flex items-center gap-2"
          >
            <Trash2 className="h-4 w-4" />삭제
          </button>
        </div>
      </div>

      {/* Timer & Progress */}
      <div className="mt-4 grid md:grid-cols-3 gap-4 items-center">
        <div>
          <div className="text-sm text-gray-500 mb-1">누적 시간</div>
          <div className="text-2xl font-mono font-bold">{MS_TO_HMS(project.effectiveElapsedMs)}</div>
        </div>
        <div>
          <div className="text-sm text-gray-500 mb-1">목표 시간</div>
          <div className="font-semibold">{project.targetHours}시간</div>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-500 mb-1">진행률</div>
          <div className="font-semibold">{project.progress.toFixed(1)}%</div>
        </div>
      </div>

      <div className="mt-3">
        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-600 transition-all"
            style={{ width: `${project.progress}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>0h</span>
          <span>남은 시간: {MS_TO_HMS(remainingMs)}</span>
          <span>{project.targetHours}h</span>
        </div>
      </div>

      {project.isRunning && (
        <div className="mt-3 text-xs text-gray-500">타이머 실행 중… 앱을 닫아도 진행상황은 저장됩니다.</div>
      )}
    </div>
  );
}

/*
======================== PWA FILES (Put these under /public) ========================

1) /public/manifest.webmanifest
{
  "name": "작심백시간",
  "short_name": "100h",
  "description": "프로젝트별 누적 타이머 – 작심백시간",
  "start_url": ".",
  "scope": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#4f46e5",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}

2) /public/sw.js  (very simple cache-first SW)
const CACHE_NAME = 'jaksim100h-cache-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest'
  // Vite/CRA will add built assets with hashed names; runtime caching will handle them
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => k !== CACHE_NAME && caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only cache GET
  if (req.method !== 'GET') return;
  event.respondWith(
    caches.match(req).then((cached) =>
      cached || fetch(req).then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return res;
      }).catch(() => cached)
    )
  );
});

3) /public/icons/
- icon-192.png, icon-512.png, maskable-512.png (원하면 내가 만들어줄게!)

======================== Vercel/Netlify Deploy Tips ========================
- Vite
  - package.json scripts: {
      "build": "vite build",
      "preview": "vite preview",
      "dev": "vite"
    }
  - Vercel: Framework = Vite, Output = dist
- CRA
  - scripts: build → Netlify/Vercel에 /build 폴더 업로드

======================== iOS/Android 설치 방법 ========================
- iOS(Safari): URL 접속 → 공유 버튼 → 홈 화면에 추가
- Android(Chrome): URL 접속 → 하단 배너의 설치 or 메뉴 → 홈 화면에 추가

*/
