export interface Habit {
  id: number;
  name: string;
  description: string;
  frequency: string;
  start_date: string;
  created_at: string;
}

export interface Log {
  id: number;
  habit_id: number;
  date: string;
  status: number;
}

export interface HabitStats {
  habit: Habit;
  streak: number;
  completionRate: number;
  todayStatus: boolean;
}
