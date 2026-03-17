export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  isPremium: boolean;
  deviceId: string;
  trials: {
    slides: number;
    solver: number;
    humanizer: number;
    detector: number;
  };
  createdAt: string;
}

export interface Flashcard {
  question: string;
  answer: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
}

export interface StudyMaterial {
  id?: string;
  userId: string;
  title: string;
  summary: string;
  flashcards: Flashcard[];
  quiz: QuizQuestion[];
  createdAt: string;
}
