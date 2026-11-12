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

type ExpertQuestion = {
  id: string;
  question: string;
  answer: string | null;
  scenarioId: string | null;
  scenarioTitle: string | null;
  studentUsername: string;
  answeredByUsername: string | null;
  createdAt: string;
  answeredAt: string | null;
};

type Scenario = {
  id: string;
  title: string;
  scenarioText: string;
  context: string;
  videoUrl: string;
  uploadedVideoUrl: string;
  perspectives: Array<{ id: string; label: string; text: string }>;
  reflectionQuestions: Array<{ id: string; text: string }>;
  status: 'published';
  publishedAt: string | null;
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
const STUDENT_APP_URL =
  import.meta.env.VITE_STUDENT_APP_URL ||
  (import.meta.env.DEV ? 'http://localhost:5173' : 'http://localhost:8081');

async function request<T>(
  path: string,
  body?: object,
  method?: 'POST' | 'PATCH',
): Promise<T> {
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
    throw new ApiRequestError(message || `İstek başarısız oldu (${response.status}).`, response.status);
  }
  return payload;
}

function TeacherApp() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'questions' | 'scenarios'>('questions');
  const [questions, setQuestions] = useState<ExpertQuestion[]>([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [savingAnswer, setSavingAnswer] = useState(false);
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
    void request<User>('/auth/me?role=teacher')
      .then((currentUser) => {
        if (currentUser.role === 'teacher') {
          setUser(currentUser);
          if (!currentUser.tutorialCompleted) {
            setTutorialStep(0);
            setSidebarOpen(window.matchMedia('(max-width: 760px)').matches);
          }
        }
        else setRedirecting(true);
      })
      .catch((cause: unknown) => {
        if (cause instanceof ApiRequestError && (cause.status === 401 || cause.status === 403)) {
          setRedirecting(true);
        } else setError(errorMessage(cause));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    void refreshQuestions();
    void refreshScenarios();
  }, [user]);

  useEffect(() => {
    const selected = questions.find((question) => question.id === selectedQuestionId);
    setAnswer(selected?.answer ?? '');
  }, [questions, selectedQuestionId]);

  async function refreshQuestions() {
    try {
      const result = await request<ExpertQuestion[]>('/expert-questions');
      setQuestions(result);
      setSelectedQuestionId((current) =>
        current && result.some((question) => question.id === current)
          ? current
          : result[0]?.id ?? null,
      );
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    }
  }

  async function refreshScenarios() {
    try {
      const result = await request<Scenario[]>('/scenarios/review');
      setScenarios(result);
      setSelectedScenarioId((current) =>
        current && result.some((scenario) => scenario.id === current)
          ? current
          : result[0]?.id ?? null,
      );
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    }
  }

  async function saveAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedQuestionId) return;
    setSavingAnswer(true);
    setError('');
    setMessage('');
    try {
      const updated = await request<ExpertQuestion>(
        `/expert-questions/${selectedQuestionId}/answer`,
        { answer },
        'PATCH',
      );
      setQuestions((current) =>
        current.map((question) => question.id === updated.id ? updated : question),
      );
      setMessage('Yanıt öğrenciye özel olarak iletildi.');
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setSavingAnswer(false);
    }
  }

  async function logout() {
    setError('');
    try {
      await request('/auth/logout?role=teacher', {});
      window.location.assign(STUDENT_APP_URL);
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

  useEffect(() => {
    if (redirecting) window.location.replace(`${STUDENT_APP_URL}/login`);
  }, [redirecting]);

  if (loading || redirecting || !user) {
    return (
      <main className="staff-loading">
        <p className="eyebrow">Şakanın Sınırında</p>
        <p role="status">
          {loading ? 'Oturum kontrol ediliyor…' : redirecting ? 'Tek giriş ekranına yönlendiriliyorsun…' : error}
        </p>
        {!loading && !redirecting && error && (
          <button
            className="primary-button"
            onClick={() => window.location.assign(`${STUDENT_APP_URL}/login`)}
            type="button"
          >
            Giriş sayfasına dön
          </button>
        )}
      </main>
    );
  }

  const selectedQuestion = questions.find((question) => question.id === selectedQuestionId) ?? null;
  const selectedScenario = scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? null;
  const pendingCount = questions.filter((question) => !question.answer).length;

  return (
    <main className={`teacher-shell${sidebarOpen ? ' sidebar-open' : ''}`}>
      {sidebarOpen && <button className="sidebar-backdrop" aria-label="Menüyü kapat" onClick={() => setSidebarOpen(false)} type="button" />}
      <aside className="teacher-sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-brand-mark">ŞS</span>
          <span>Şakanın<br />Sınırında</span>
        </div>
        <p className="sidebar-section-label">MENÜ</p>
        <nav className="sidebar-nav" aria-label="Uzman menüsü">
          <button
            aria-current={activeTab === 'questions' ? 'page' : undefined}
            className={activeTab === 'questions' ? 'sidebar-link active' : 'sidebar-link'}
            id="nav-questions"
            onClick={() => { setActiveTab('questions'); setError(''); setMessage(''); setSidebarOpen(false); }}
            type="button"
          >
            <span aria-hidden="true">✉</span> Öğrenci soruları
            {pendingCount > 0 && <span className="sidebar-count">{pendingCount}</span>}
          </button>
          <button
            aria-current={activeTab === 'scenarios' ? 'page' : undefined}
            className={activeTab === 'scenarios' ? 'sidebar-link active' : 'sidebar-link'}
            id="nav-scenarios"
            onClick={() => { setActiveTab('scenarios'); setError(''); setMessage(''); setSidebarOpen(false); }}
            type="button"
          >
            <span aria-hidden="true">▤</span> Senaryo inceleme
          </button>
        </nav>
        <div className="sidebar-user">
          <span className="sidebar-avatar">{user.username.slice(0, 1).toUpperCase()}</span>
          <span className="sidebar-user-copy">
            <strong>{user.username}</strong>
          </span>
          <button className="sidebar-logout" id="sidebar-logout" onClick={() => void logout()} type="button">Çıkış</button>
        </div>
      </aside>

      <section className="teacher-workspace">
        <header className="workspace-header">
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
          <button
            className="secondary-button"
            onClick={() => activeTab === 'questions' ? void refreshQuestions() : void refreshScenarios()}
            type="button"
          >
            Yenile
          </button>
        </header>

        {message && <p className="success" role="status">{message}</p>}
        {error && <p className="error" role="alert">{error}</p>}

        {activeTab === 'questions' ? (
          <div className="teacher-content-grid">
            <section className="teacher-panel question-inbox">
              <div className="panel-title-row">
                <div>
                  <p className="eyebrow">GELEN KUTUSU</p>
                  <h2>Sorular</h2>
                </div>
                <span className="panel-count">{questions.length}</span>
              </div>
              {questions.length === 0 ? (
                <p className="empty-state">Henüz öğrenci sorusu yok.</p>
              ) : (
                <ul className="question-inbox-list">
                  {questions.map((question) => (
                    <li key={question.id}>
                      <button
                        aria-current={selectedQuestionId === question.id ? 'true' : undefined}
                        className={`question-inbox-item${selectedQuestionId === question.id ? ' selected' : ''}`}
                        onClick={() => { setSelectedQuestionId(question.id); setMessage(''); }}
                        type="button"
                      >
                        <span className="inbox-item-top">
                          <strong>{question.studentUsername}</strong>
                          <time dateTime={question.createdAt}>
                            {new Date(question.createdAt).toLocaleDateString('tr-TR')}
                          </time>
                        </span>
                        <span className="inbox-item-question">{question.question}</span>
                        <span className="inbox-item-bottom">
                          <span>{question.scenarioTitle ?? 'Genel soru'}</span>
                          <span className={question.answer ? 'answered-tag' : 'pending-tag'}>
                            {question.answer ? 'Yanıtlandı' : 'Yanıt bekliyor'}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="teacher-panel question-detail">
              {selectedQuestion ? (
                <>
                  <div className="panel-title-row">
                    <div>
                      <p className="eyebrow">{selectedQuestion.scenarioTitle ?? 'GENEL SORU'}</p>
                      <h2>{selectedQuestion.studentUsername}</h2>
                    </div>
                    <span className={selectedQuestion.answer ? 'answered-tag' : 'pending-tag'}>
                      {selectedQuestion.answer ? 'Yanıtlandı' : 'Yanıt bekliyor'}
                    </span>
                  </div>
                  <article className="student-question">
                    <span>ÖĞRENCİNİN SORUSU</span>
                    <p>{selectedQuestion.question}</p>
                  </article>
                  <form className="answer-form" onSubmit={(event) => void saveAnswer(event)}>
                    <label htmlFor="expert-answer">Yanıtın</label>
                    <textarea
                      id="expert-answer"
                      maxLength={4000}
                      minLength={1}
                      onChange={(event) => setAnswer(event.target.value)}
                      placeholder="Destekleyici ve yol gösterici bir yanıt yaz…"
                      required
                      rows={7}
                      value={answer}
                    />
                    <div className="answer-form-footer">
                      <span>Yanıt yalnızca bu öğrenciye görünür.</span>
                      <button className="primary-button" disabled={savingAnswer} type="submit">
                        {savingAnswer ? 'Gönderiliyor…' : selectedQuestion.answer ? 'Yanıtı güncelle' : 'Yanıtı gönder'}
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="empty-detail">
                  <span aria-hidden="true">✉</span>
                  <h2>Bir soru seç</h2>
                  <p>Öğrencilerin sorularını burada görüntüleyip yanıtlayabilirsin.</p>
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="teacher-content-grid scenario-review-grid">
            <section className="teacher-panel scenario-review-list">
              <div className="panel-title-row">
                <div>
                  <p className="eyebrow">YAYIMLANANLAR</p>
                  <h2>Senaryolar</h2>
                </div>
                <span className="panel-count">{scenarios.length}</span>
              </div>
              {scenarios.length === 0 ? (
                <p className="empty-state">Henüz incelenecek yayımlanmış senaryo yok.</p>
              ) : (
                <ul className="question-inbox-list">
                  {scenarios.map((scenario) => (
                    <li key={scenario.id}>
                      <button
                        aria-current={selectedScenarioId === scenario.id ? 'true' : undefined}
                        className={`question-inbox-item scenario-review-item${selectedScenarioId === scenario.id ? ' selected' : ''}`}
                        onClick={() => setSelectedScenarioId(scenario.id)}
                        type="button"
                      >
                        <span className="inbox-item-top">
                          <strong>{scenario.title}</strong>
                          <span className="published-tag">Yayında</span>
                        </span>
                        <span className="inbox-item-question">{scenario.scenarioText}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="teacher-panel scenario-review-detail">
              {selectedScenario ? (
                <article className="scenario-review-document">
                  <p className="eyebrow">SENARYO · İÇERİK İNCELEMESİ</p>
                  <h2>{selectedScenario.title}</h2>
                  <section>
                    <h3>Senaryo</h3>
                    <p>{selectedScenario.scenarioText}</p>
                    {(selectedScenario.uploadedVideoUrl || selectedScenario.videoUrl) && (
                      <ScenarioMedia
                        className="scenario-video"
                        title={selectedScenario.title}
                        url={selectedScenario.uploadedVideoUrl || selectedScenario.videoUrl}
                      />
                    )}
                  </section>
                  <section>
                    <h3>Bağlam</h3>
                    <p>{selectedScenario.context}</p>
                  </section>
                  <section>
                    <h3>Farklı bakış açıları</h3>
                    <div className="review-perspectives">
                      {selectedScenario.perspectives.map((perspective) => (
                        <article key={perspective.id}>
                          <h4>{perspective.label}</h4>
                          <p>{perspective.text}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                  <section>
                    <h3>Yansıtıcı sorular</h3>
                    <ol className="review-reflection-list">
                      {selectedScenario.reflectionQuestions.map((question) => (
                        <li key={question.id}>{question.text}</li>
                      ))}
                    </ol>
                  </section>
                </article>
              ) : (
                <div className="empty-detail">
                  <span aria-hidden="true">▤</span>
                  <h2>Bir senaryo seç</h2>
                  <p>Yayımlanmış senaryo içeriği ve bakış açıları burada görüntülenir.</p>
                </div>
              )}
            </section>
          </div>
        )}
      </section>
      {tutorialStep !== null && (
        <TeacherTutorial
          step={tutorialStep}
          onFinish={() => void finishTutorial()}
          onNext={() => setTutorialStep((step) => (step ?? 0) + 1)}
        />
      )}
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

function TeacherTutorial(props: { step: number; onNext: () => void; onFinish: () => void }) {
  const steps = [
    { title: 'Hoş geldin', text: 'Öğrencilerin ilettiği sorular burada listelenir.', target: 'nav-questions' },
    { title: 'Öğrenci soruları', text: 'Bir soruyu seçerek ayrıntısını görüntüleyip yanıtlayabilirsin.', target: 'nav-questions' },
    { title: 'Senaryo inceleme', text: 'Yayımlanmış senaryoları ve videoları bu bölümde incele.', target: 'nav-scenarios' },
    { title: 'Çıkış', text: 'Oturum kapatma düğmesi menünün alt kısmında.', target: 'sidebar-logout' },
  ];
  const current = steps[Math.min(props.step, steps.length - 1)];
  const targets = steps.map((step) => step.target);
  const targetId = targets[Math.min(props.step, targets.length - 1)];
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [visible, setVisible] = useState(false);
  const tipRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const target = document.getElementById(targetId);
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
  }, [targetId]);

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TeacherApp />
  </StrictMode>,
);
