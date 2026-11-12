export type ScenarioStatus = 'draft' | 'published';

export interface Perspective {
  id: string;
  label: string;
  text: string;
}

export interface ReflectionQuestion {
  id: string;
  text: string;
}

export interface ScenarioContent {
  title: string;
  scenarioText: string;
  context: string;
  videoUrl: string;
  perspectives: Perspective[];
  reflectionQuestions: ReflectionQuestion[];
}

export interface Scenario extends ScenarioContent {
  id: string;
  uploadedVideoUrl: string;
  status: ScenarioStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface ScenarioSummary {
  id: string;
  title: string;
  status: ScenarioStatus;
  createdAt: string;
  publishedAt: string | null;
  hasResponse?: boolean;
}

export interface ScenarioDetail extends Scenario {
  answers: Record<string, string>;
  classification: 'joke' | 'bullying' | null;
  reasoning: string;
}
