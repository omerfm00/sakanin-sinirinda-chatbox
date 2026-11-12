import { StrictMode, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

type User = {
  id: string;
  username: string;
  role: 'student' | 'teacher' | 'admin';
  tutorialCompleted: boolean;
};

type ScenarioSummary = {
  id: string;
  title: string;
  status: 'published';
  createdAt: string;
  publishedAt: string | null;
  hasResponse: boolean;
};

type Perspective = {
  id: string;
  label: string;
  text: string;
};

type ReflectionQuestion = {
  id: string;
  text: string;
};

type ScenarioDetail = ScenarioSummary & {
  scenarioText: string;
  context: string;
  videoUrl: string;
  uploadedVideoUrl: string;
  perspectives: Perspective[];
  reflectionQuestions: ReflectionQuestion[];
  answers: Record<string, string>;
  classification: 'joke' | 'bullying' | null;
  reasoning: string;
  updatedAt: string;
};

type ExpertQuestion = {
  id: string;
  question: string;
  answer: string | null;
  scenarioId: string | null;
  scenarioTitle: string | null;
  answeredByUsername: string | null;
  createdAt: string;
  answeredAt: string | null;
};

type ApiFailure = {
  message?: string | string[];
};

class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV
    ? `${window.location.protocol}//${window.location.hostname}:3000/api`
    : '/api');
const APP_URLS: Record<User['role'], string> = {
  student: import.meta.env.VITE_STUDENT_APP_URL,
  teacher: import.meta.env.VITE_TEACHER_APP_URL,
  admin: import.meta.env.VITE_ADMIN_APP_URL,
};

function getAppUrl(role: User['role']): string {
  if (APP_URLS[role]) return APP_URLS[role];
  const appUrl = new URL(window.location.origin);
  appUrl.port = String(
    role === 'student' ? (import.meta.env.DEV ? 5173 : 8081)
      : role === 'teacher' ? (import.meta.env.DEV ? 5174 : 8082)
        : (import.meta.env.DEV ? 5175 : 8083),
  );
  return appUrl.origin;
}

async function request<T>(path: string, body?: object, method?: 'POST' | 'PATCH'): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: method ?? (body ? 'POST' : 'GET'),
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json().catch(() => ({}))) as T & ApiFailure;
  if (!response.ok) {
    const message = Array.isArray(payload.message)
      ? payload.message.join(' ')
      : payload.message;
    throw new ApiRequestError(
      message || `İstek başarısız oldu (${response.status}).`,
      response.status,
    );
  }
  return payload;
}

function StudentApp() {
  const [user, setUser] = useState<User | null>(null);
  const [activePage, setActivePage] = useState<'scenarios' | 'expert'>('scenarios');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [activeScenario, setActiveScenario] = useState<ScenarioDetail | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [classification, setClassification] = useState<'joke' | 'bullying' | ''>('');
  const [reasoning, setReasoning] = useState('');
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [questions, setQuestions] = useState<ExpertQuestion[]>([]);
  const [questionText, setQuestionText] = useState('');
  const [questionScenarioId, setQuestionScenarioId] = useState('');
  const [questionSaving, setQuestionSaving] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState<number | null>(null);

  useEffect(() => {
    const viewport = window.matchMedia('(max-width: 760px)');
    const updateDevice = () => {
      document.documentElement.dataset.deviceType = viewport.matches ? 'mobile' : 'desktop';
    };
    updateDevice();
    viewport.addEventListener('change', updateDevice);
    return () => viewport.removeEventListener('change', updateDevice);
  }, []);

  useEffect(() => {
    if (window.location.pathname === '/register') {
      window.history.replaceState(null, '', '/login');
    }
  }, []);

  useEffect(() => {
    const roles: User['role'][] = ['student', 'teacher', 'admin'];
    void Promise.all(
      roles.map(async (role) => {
        try {
          return await request<User>(`/auth/me?role=${role}`);
        } catch (cause: unknown) {
          if (isUnauthorized(cause)) return null;
          throw cause;
        }
      })
    )
      .then((users) => {
        const currentUser = users.find((candidate) => candidate !== null);
        if (!currentUser) return;
        if (currentUser.role === 'student') {
          setUser(currentUser);
          if (!currentUser.tutorialCompleted) {
            setTutorialStep(0);
            setSidebarOpen(window.matchMedia('(max-width: 760px)').matches);
          }
        }
        else window.location.replace(getAppUrl(currentUser.role));
      })
      .catch((cause: unknown) => {
        setError(errorMessage(cause));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    void request<ScenarioSummary[]>('/scenarios')
      .then(setScenarios)
      .catch((cause: unknown) => setError(errorMessage(cause)));
    void refreshQuestions();
  }, [user]);

  async function refreshQuestions() {
    try {
      setQuestions(await request<ExpertQuestion[]>('/expert-questions/mine'));
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    }
  }

  async function submitExpertQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuestionSaving(true);
    setError('');
    setMessage('');
    try {
      await request<ExpertQuestion>('/expert-questions', {
        question: questionText,
        ...(questionScenarioId ? { scenarioId: questionScenarioId } : {}),
      });
      setQuestionText('');
      setQuestionScenarioId('');
      setMessage('Sorun uzmana iletildi. Yanıtı yalnızca sen görebilirsin.');
      await refreshQuestions();
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setQuestionSaving(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const result = await request<{ user: User }>('/auth/login', {
        username,
        password,
      });
      if (result.user.role !== 'student') {
        window.location.assign(getAppUrl(result.user.role));
        return;
      }
      setUser(result.user);
      setPassword('');
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    }
  }

  async function openScenario(id: string) {
    setError('');
    setMessage('');
    setActiveScenario(null);
    setScenarioLoading(true);
    try {
      const scenario = await request<ScenarioDetail>(`/scenarios/${id}`);
      setActiveScenario(scenario);
      setAnswers(scenario.answers);
      setClassification(scenario.classification ?? '');
      setReasoning(scenario.reasoning);
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setScenarioLoading(false);
    }
  }

  async function saveAnswers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeScenario) return;
    setError('');
    setMessage('');
    const filledAnswers = Object.fromEntries(
      Object.entries(answers).filter(([, answer]) => answer.trim().length > 0),
    );
    if (!classification || reasoning.trim().length < 3) {
      setError('Şaka/zorbalık seçimini ve en az 3 karakterlik gerekçeni ekle.');
      return;
    }
    const selectedClassification = classification;

    setSaving(true);
    try {
      await request(`/scenarios/${activeScenario.id}/responses`, {
        answers: filledAnswers,
        classification: selectedClassification,
        reasoning,
      });
      setActiveScenario({
        ...activeScenario,
        answers: { ...answers },
        classification: selectedClassification,
        reasoning,
      });
      setScenarios((current) =>
        current.map((scenario) =>
          scenario.id === activeScenario.id
            ? { ...scenario, hasResponse: Object.keys(filledAnswers).length > 0 }
            : scenario,
        ),
      );
      setMessage('Değerlendirmen kaydedildi. Yanıtların yalnızca yetkili yönetici incelemesi için hesabınla ilişkilendirilir.');
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    setError('');
    try {
      await request('/auth/logout?role=student', {});
      setUser(null);
      setScenarios([]);
      setActiveScenario(null);
      setAnswers({});
      window.history.replaceState(null, '', '/');
      setMessage('Oturum kapatıldı.');
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    }
  }

  async function finishTutorial() {
    try {
      const updated = await request<User>('/auth/tutorial-complete', {}, 'PATCH');
      setUser(updated);
      setTutorialStep(null);
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    }
  }

  if (loading) {
    return (
      <main>
        <p className="eyebrow">Şakanın Sınırında</p>
        <p role="status">Oturum kontrol ediliyor…</p>
      </main>
    );
  }

  if (user) {
    return (
      <main className={`student-shell${sidebarOpen ? ' sidebar-open' : ''}`}>
        {sidebarOpen && <button className="sidebar-backdrop" aria-label="Menüyü kapat" onClick={() => setSidebarOpen(false)} type="button" />}
        <aside className="student-sidebar">
          <div className="sidebar-brand">
            <span className="sidebar-brand-mark">ŞS</span>
            <span>Şakanın<br />Sınırında</span>
          </div>
          <p className="sidebar-section-label">MENÜ</p>
          <nav className="sidebar-nav" aria-label="Öğrenci menüsü">
            <button
              aria-current={activePage === 'scenarios' ? 'page' : undefined}
              className={activePage === 'scenarios' ? 'sidebar-link active' : 'sidebar-link'}
              id="nav-scenarios"
              onClick={() => { setActivePage('scenarios'); setError(''); setMessage(''); setSidebarOpen(false); }}
              type="button"
            >
              <span aria-hidden="true">▤</span> Senaryolar
            </button>
            <button
              aria-current={activePage === 'expert' ? 'page' : undefined}
              className={activePage === 'expert' ? 'sidebar-link active' : 'sidebar-link'}
              id="nav-expert"
              onClick={() => { setActivePage('expert'); setActiveScenario(null); setError(''); setMessage(''); setSidebarOpen(false); }}
              type="button"
            >
              <span aria-hidden="true">✉</span> Uzmana Sor
              {questions.some((question) => question.answer) && (
                <span className="sidebar-badge" aria-label="Yanıt geldi">•</span>
              )}
            </button>
          </nav>
          <div className="sidebar-user">
            <span className="sidebar-avatar">{user.username.slice(0, 1).toUpperCase()}</span>
            <span className="sidebar-username">{user.username}</span>
            <button className="sidebar-logout" id="sidebar-logout" onClick={() => void logout()} type="button">
              Çıkış
            </button>
          </div>
        </aside>

        <div className="student-workspace">
          <header className="student-header">
            <div>
              <button
                aria-expanded={sidebarOpen}
                aria-label={sidebarOpen ? 'Menüyü kapat' : 'Menüyü aç'}
                className="mobile-menu-button"
                onClick={() => setSidebarOpen((open) => !open)}
                type="button"
              >
                ☰
              </button>
              <h1>Merhaba, {user.username}</h1>
            </div>
          </header>

          {activePage === 'expert' ? (
            <div className="expert-question-layout">
              <section className="expert-panel">
                <p className="eyebrow">GÜVENLİ VE ÖZEL</p>
                <h2>Aklına takılanı sor</h2>
                <p className="muted">
                  Sorunu yalnızca sen, uzmanlar ve yöneticiler görebilir. Uzmanın yanıtı bu alanda görünür.
                </p>
                <form className="expert-question-form" onSubmit={(event) => void submitExpertQuestion(event)}>
                  <label htmlFor="question-scenario">İlgili senaryo (isteğe bağlı)</label>
                  <select
                    id="question-scenario"
                    onChange={(event) => setQuestionScenarioId(event.target.value)}
                    value={questionScenarioId}
                  >
                    <option value="">Genel bir soru</option>
                    {scenarios.map((scenario) => (
                      <option key={scenario.id} value={scenario.id}>{scenario.title}</option>
                    ))}
                  </select>
                  <label htmlFor="expert-question">Sorun</label>
                  <textarea
                    id="expert-question"
                    maxLength={4000}
                    minLength={3}
                    onChange={(event) => setQuestionText(event.target.value)}
                    placeholder="Merak ettiğin konuyu burada paylaşabilirsin…"
                    required
                    rows={5}
                    value={questionText}
                  />
                  <div className="question-form-footer">
                    <span>{questionText.length}/4000</span>
                    <button className="primary-button" disabled={questionSaving} type="submit">
                      {questionSaving ? 'Gönderiliyor…' : 'Uzmanla paylaş'}
                    </button>
                  </div>
                </form>
              </section>
              <section className="expert-panel">
                <div className="expert-panel-heading">
                  <div>
                    <p className="eyebrow">ÖZEL MESAJLARIN</p>
                    <h2>Sorularım ve yanıtlar</h2>
                  </div>
                  <button className="secondary-button" onClick={() => void refreshQuestions()} type="button">Yenile</button>
                </div>
                {questions.length === 0 ? (
                  <p className="empty-state">Henüz soru göndermedin.</p>
                ) : (
                  <ul className="expert-question-list">
                    {questions.map((question) => (
                      <li className="expert-question-card" key={question.id}>
                        <div className="question-card-meta">
                          <span>{question.scenarioTitle ?? 'Genel soru'}</span>
                          <time dateTime={question.createdAt}>{new Date(question.createdAt).toLocaleDateString('tr-TR')}</time>
                        </div>
                        <h3>{question.question}</h3>
                        {question.answer ? (
                          <div className="expert-answer">
                            <span>Uzman yanıtı · {question.answeredByUsername}</span>
                            <p>{question.answer}</p>
                          </div>
                        ) : (
                          <p className="question-pending">Uzman yanıtı bekleniyor</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          ) : scenarioLoading ? (
            <p role="status">Senaryo yükleniyor…</p>
          ) : activeScenario ? (
            <>
              <button className="text-button back-button" onClick={() => setActiveScenario(null)} type="button">
                ← Senaryolara dön
              </button>
              <div className="scenario-detail-heading">
                <span className="scenario-status-pill">YAYINDA</span>
                <button
                  className="secondary-button ask-expert-button"
                  onClick={() => {
                    setQuestionScenarioId(activeScenario.id);
                    setActivePage('expert');
                    setMessage('');
                    setError('');
                  }}
                  type="button"
                >
                  ✉ Uzmana Sor
                </button>
              </div>
              <section className="content-section">
                <h2>Senaryo</h2>
                <p>{activeScenario.scenarioText}</p>
                {(activeScenario.uploadedVideoUrl || activeScenario.videoUrl) && (
                  <ScenarioMedia
                    className="scenario-video"
                    title={activeScenario.title}
                    url={activeScenario.uploadedVideoUrl || activeScenario.videoUrl}
                  />
                )}
              </section>
              <section className="content-section">
                <h2>Bağlam</h2>
                <p>{activeScenario.context}</p>
              </section>
              <section className="content-section">
                <h2>Farklı bakış açıları</h2>
                <div className="perspective-grid">
                  {activeScenario.perspectives.map((perspective) => (
                    <article className="perspective-card" key={perspective.id}>
                      <h3>{perspective.label}</h3>
                      <p>{perspective.text}</p>
                    </article>
                  ))}
                </div>
              </section>
              <section className="content-section">
                <h2>Üzerine düşün</h2>
                <p className="muted">
                  Yanıtların doğru/yanlış olarak değerlendirilmez; kendi düşünceni paylaşabilirsin.
                </p>
                <form className="reflection-form" onSubmit={(event) => void saveAnswers(event)}>
                  <fieldset className="classification-fieldset">
                    <legend>Bu durumu nasıl değerlendiriyorsun?</legend>
                    <label>
                      <input
                        checked={classification === 'joke'}
                        name="classification"
                        onChange={() => setClassification('joke')}
                        required
                        type="radio"
                        value="joke"
                      />
                      Şaka
                    </label>
                    <label>
                      <input
                        checked={classification === 'bullying'}
                        name="classification"
                        onChange={() => setClassification('bullying')}
                        required
                        type="radio"
                        value="bullying"
                      />
                      Zorbalık
                    </label>
                  </fieldset>
                  <label htmlFor="classification-reason">Neden böyle düşündüğünü açıkla</label>
                  <textarea
                    id="classification-reason"
                    maxLength={3000}
                    minLength={3}
                    onChange={(event) => setReasoning(event.target.value)}
                    required
                    rows={4}
                    value={reasoning}
                  />
                  {activeScenario.reflectionQuestions.map((question, index) => (
                    <div className="question-item" key={question.id}>
                      <label htmlFor={`answer-${question.id}`}>
                        {index + 1}. {question.text}
                      </label>
                      <textarea
                        id={`answer-${question.id}`}
                        onChange={(event) => setAnswers({
                          ...answers,
                          [question.id]: event.target.value,
                        })}
                        rows={4}
                        value={answers[question.id] ?? ''}
                      />
                    </div>
                  ))}
                  <button className="primary-button" disabled={saving} type="submit">
                    {saving ? 'Kaydediliyor…' : 'Yanıtlarımı kaydet'}
                  </button>
                </form>
              </section>
            </>
          ) : (
            <section className="content-section">
              <div className="section-title-row">
                <div>
                  <p className="eyebrow">KEŞFET VE DÜŞÜN</p>
                  <h2>Yayımlanmış senaryolar</h2>
                </div>
                <span className="scenario-count">{scenarios.length} senaryo</span>
              </div>
              {scenarios.length === 0 ? (
                <p className="empty-state">Henüz yayımlanmış senaryo yok.</p>
              ) : (
                <ul className="student-scenario-list">
                  {scenarios.map((scenario) => (
                    <li key={scenario.id}>
                      <button
                        className="student-scenario-card"
                        onClick={() => void openScenario(scenario.id)}
                        type="button"
                      >
                        <span className="scenario-card-icon" aria-hidden="true">✳</span>
                        <span className="scenario-card-copy">
                          <strong>{scenario.title}</strong>
                          <small>{scenario.hasResponse ? 'Yanıtların kaydedildi' : 'Keşfetmeye başla'}</small>
                        </span>
                        <span className="scenario-card-arrow" aria-hidden="true">→</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {message && <p className="success" role="status">{message}</p>}
          {error && <p className="error" role="alert">{error}</p>}
        </div>
        {tutorialStep !== null && (
          <StudentTutorial
            step={tutorialStep}
            onFinish={() => void finishTutorial()}
            onNext={() => setTutorialStep((step) => (step ?? 0) + 1)}
          />
        )}
      </main>
    );
  }

  return (
    <main className="login-screen">
      <section className="login-aside" aria-label="Şakanın Sınırında hakkında">
        <p className="brand-mark" aria-hidden="true">ŞS</p>
        <p className="aside-kicker">Birlikte düşünmek için güvenli bir alan</p>
        <h1>Şaka nerede biter, incitmek nerede başlar?</h1>
        <p>
          Farklı bakış açılarına yer aç. Kendi düşünceni keşfet; yanıtların doğru ya da
          yanlış diye değerlendirilmez.
        </p>
        <div className="privacy-note">
          <span aria-hidden="true">✳</span>
          <span>Yanıtlarını yalnızca yetkili ekip senin hesabınla ilişkilendirerek inceler.</span>
        </div>
      </section>
      <section className="login-content">
        <p className="eyebrow">Şakanın Sınırında · Ortak giriş</p>
        <h2>Tekrar hoş geldin</h2>
        <p className="intro">
          Devam etmek için kullanıcı adın ve parolanla giriş yap.
        </p>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <label htmlFor="username">Kullanıcı adı</label>
          <input
            autoComplete="username"
            id="username"
            maxLength={32}
            minLength={3}
            onChange={(event) => setUsername(event.target.value)}
            required
            title="3-32 karakter; harf, rakam, nokta, alt çizgi veya tire kullanın."
            type="text"
            value={username}
          />
          <label htmlFor="password">Parola</label>
          <input
            autoComplete="current-password"
            id="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
          <button className="primary-button" type="submit">Giriş yap</button>
        </form>
        {message && <p className="success" role="status">{message}</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </section>
    </main>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Beklenmeyen bir hata oluştu.';
}

function apiResourceUrl(value: string): string {
  return value.startsWith('/api/') ? `${API_BASE}${value.slice('/api'.length)}` : value;
}

function youtubeEmbedUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const videoId = host === 'youtu.be'
    ? url.pathname.split('/').filter(Boolean)[0]
    : ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)
      ? url.pathname === '/watch'
        ? url.searchParams.get('v')
        : url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1]
      : undefined;
  return videoId && /^[\w-]{11}$/.test(videoId)
    ? `https://www.youtube-nocookie.com/embed/${videoId}`
    : null;
}

function ScenarioMedia(props: { className: string; title: string; url: string }) {
  const embedUrl = youtubeEmbedUrl(props.url);
  return embedUrl ? (
    <div className="video-embed-frame">
      <iframe
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        src={embedUrl}
        title={`${props.title} videosu`}
      />
    </div>
  ) : (
    <video
      className={props.className}
      controls
      crossOrigin={props.url.startsWith('/api/') ? 'use-credentials' : undefined}
      preload="metadata"
      src={apiResourceUrl(props.url)}
    />
  );
}

function StudentTutorial(props: { step: number; onNext: () => void; onFinish: () => void }) {
  const steps = [
    { title: 'Hoş geldin', text: 'Senaryolara buradan ulaşabilirsin.', target: 'nav-scenarios' },
    { title: 'Senaryolar', text: 'Bir senaryoyu açıp metni, farklı bakış açılarını ve videosu varsa videoyu incele.', target: 'nav-scenarios' },
    { title: 'Değerlendir', text: 'Senaryoda şaka veya zorbalık seçimini yap; gerekçeni ve yanıtlarını kaydet.', target: 'nav-scenarios' },
    { title: 'Uzmana Sor', text: 'Sorunu uzmana ilet ve yanıtını buradan takip et.', target: 'nav-expert' },
    { title: 'Çıkış', text: 'Oturumu kapatma düğmesi menünün alt kısmında.', target: 'sidebar-logout' },
  ];
  const current = steps[Math.min(props.step, steps.length - 1)];
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [visible, setVisible] = useState(false);
  const tipRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const target = document.getElementById(current.target);
    if (!target || !tipRef.current) return;
    target.classList.add('tutorial-target');
    const updatePosition = () => {
      const rect = target.getBoundingClientRect();
      const tipRect = tipRef.current?.getBoundingClientRect();
      if (!tipRect) return;
      const margin = 12;
      const left = window.innerWidth > 760
        ? Math.min(rect.right + margin, window.innerWidth - tipRect.width - margin)
        : Math.min(Math.max(margin, rect.left), window.innerWidth - tipRect.width - margin);
      const below = rect.bottom + margin;
      const top = below + tipRect.height <= window.innerHeight - margin
        ? below
        : Math.max(margin, rect.top - tipRect.height - margin);
      setPosition({ top, left: Math.max(margin, left) });
      setVisible(true);
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      target.classList.remove('tutorial-target');
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [current.target]);

  return (
    <aside
      className="tutorial-coachmark"
      ref={tipRef}
      role="note"
      aria-live="polite"
      style={{ top: position.top, left: position.left, visibility: visible ? 'visible' : 'hidden' }}
    >
      <p className="eyebrow">REHBER · {Math.min(props.step + 1, steps.length)}/{steps.length}</p>
      <h2>{current.title}</h2>
      <p>{current.text}</p>
      <div className="tutorial-actions">
        <button className="text-button" onClick={props.onFinish} type="button">Atla</button>
        <button className="primary-button" onClick={props.step + 1 >= steps.length ? props.onFinish : props.onNext} type="button">
          {props.step + 1 >= steps.length ? 'Tamamla' : 'İleri'}
        </button>
      </div>
    </aside>
  );
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.status === 401 || error.status === 403);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StudentApp />
  </StrictMode>,
);
