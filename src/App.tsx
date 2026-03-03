import React, { useState, useEffect, useMemo } from "react";
import { 
  Plus, 
  Flame, 
  CheckCircle2, 
  Circle, 
  TrendingUp, 
  Calendar as CalendarIcon, 
  BarChart3, 
  Settings2, 
  Trash2,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Info
} from "lucide-react";
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay, 
  subDays, 
  isToday, 
  startOfDay,
  parseISO,
  differenceInDays,
  isAfter,
  isBefore,
  isSameMonth
} from "date-fns";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from "recharts";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Habit, Log, HabitStats } from "./types";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Form State
  const [newHabit, setNewHabit] = useState({
    name: "",
    description: "",
    frequency: "daily",
    start_date: format(new Date(), "yyyy-MM-dd")
  });

  useEffect(() => {
    fetchHabits();
    fetchLogs();
  }, []);

  const fetchHabits = async () => {
    const res = await fetch("/api/habits");
    const data = await res.json();
    setHabits(data);
  };

  const fetchLogs = async () => {
    const res = await fetch("/api/logs");
    const data = await res.json();
    setLogs(data);
  };

  const addHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (habits.length >= 5) {
      alert("Max 5 active habits allowed to prevent overwhelm.");
      return;
    }
    await fetch("/api/habits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newHabit)
    });
    setNewHabit({ name: "", description: "", frequency: "daily", start_date: format(new Date(), "yyyy-MM-dd") });
    setIsModalOpen(false);
    fetchHabits();
  };

  const deleteHabit = async (id: number) => {
    if (confirm("Are you sure you want to delete this habit?")) {
      await fetch(`/api/habits/${id}`, { method: "DELETE" });
      fetchHabits();
      fetchLogs();
    }
  };

  const toggleLog = async (habitId: number, date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const existingLog = logs.find(l => l.habit_id === habitId && l.date === dateStr);
    const newStatus = existingLog?.status === 1 ? 0 : 1;

    await fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ habit_id: habitId, date: dateStr, status: newStatus })
    });
    fetchLogs();
  };

  const generateAISummary = async () => {
    setIsGeneratingSummary(true);
    try {
      const res = await fetch("/api/analytics/summary");
      const data = await res.json();
      setAiSummary(data.summary);
    } catch (error) {
      console.error(error);
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const habitStats = useMemo(() => {
    return habits.map(habit => {
      // Calculate Streak
      let streak = 0;
      let checkDate = startOfDay(new Date());
      
      // If today is not done, start checking from yesterday
      const todayDone = logs.some(l => l.habit_id === habit.id && l.date === format(checkDate, "yyyy-MM-dd") && l.status === 1);
      if (!todayDone) {
        checkDate = subDays(checkDate, 1);
      }

      while (true) {
        const dateStr = format(checkDate, "yyyy-MM-dd");
        const done = logs.some(l => l.habit_id === habit.id && l.date === dateStr && l.status === 1);
        if (done) {
          streak++;
          checkDate = subDays(checkDate, 1);
        } else {
          break;
        }
        // Safety break
        if (streak > 1000) break;
      }

      // Completion Rate (Last 30 days)
      const startDate = parseISO(habit.start_date);
      const daysSinceStart = Math.max(1, differenceInDays(new Date(), startDate) + 1);
      const relevantDays = Math.min(30, daysSinceStart);
      const completedInPeriod = logs.filter(l => 
        l.habit_id === habit.id && 
        l.status === 1 && 
        isAfter(parseISO(l.date), subDays(new Date(), relevantDays))
      ).length;
      
      const completionRate = Math.round((completedInPeriod / relevantDays) * 100);

      // Last 7 days history
      const last7Days = eachDayOfInterval({
        start: subDays(new Date(), 6),
        end: new Date()
      }).map(date => {
        const dateStr = format(date, "yyyy-MM-dd");
        return logs.some(l => l.habit_id === habit.id && l.date === dateStr && l.status === 1);
      });

      return {
        habit,
        streak,
        completionRate,
        history: last7Days,
        todayStatus: logs.some(l => l.habit_id === habit.id && l.date === format(selectedDate, "yyyy-MM-dd") && l.status === 1)
      };
    });
  }, [habits, logs, selectedDate]);

  const overallAccuracy = useMemo(() => {
    if (habitStats.length === 0) return 0;
    return Math.round(habitStats.reduce((acc, curr) => acc + curr.completionRate, 0) / habitStats.length);
  }, [habitStats]);

  const chartData = useMemo(() => {
    const last7Days = eachDayOfInterval({
      start: subDays(new Date(), 6),
      end: new Date()
    });

    return last7Days.map(date => {
      const dateStr = format(date, "yyyy-MM-dd");
      const completedCount = logs.filter(l => l.date === dateStr && l.status === 1).length;
      const rate = habits.length > 0 ? (completedCount / habits.length) * 100 : 0;
      return {
        date: format(date, "MMM dd"),
        rate: Math.round(rate)
      };
    });
  }, [logs, habits]);

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-zinc-200">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center text-white shadow-sm">
              <TrendingUp size={20} />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Consistency Engine</h1>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="p-2 bg-brand hover:bg-brand-dark text-white rounded-full transition-colors shadow-sm"
          >
            <Plus size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Stats Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-zinc-500 uppercase tracking-wider">Overall Accuracy</span>
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                <BarChart3 size={18} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold">{overallAccuracy}%</span>
              <span className="text-sm text-zinc-400">last 30d</span>
            </div>
            <div className="mt-4 w-full bg-zinc-100 h-2 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${overallAccuracy}%` }}
                className="h-full bg-brand"
              />
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-zinc-500 uppercase tracking-wider">Active Habits</span>
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <Settings2 size={18} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold">{habits.length}</span>
              <span className="text-sm text-zinc-400">/ 5 max</span>
            </div>
            <p className="mt-4 text-sm text-zinc-500">
              {habits.length === 0 ? "Add your first habit to start." : "Focus on your core routines."}
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-zinc-500 uppercase tracking-wider">Best Streak</span>
              <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
                <Flame size={18} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold">
                {Math.max(0, ...habitStats.map(s => s.streak))}
              </span>
              <span className="text-sm text-zinc-400">days</span>
            </div>
            <p className="mt-4 text-sm text-zinc-500">
              Consistency is the key to mastery.
            </p>
          </motion.div>
        </section>

        {/* Daily Tracker */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <CalendarIcon size={20} className="text-brand" />
              Daily Tracking
            </h2>
            <div className="flex items-center gap-2 bg-white border border-zinc-200 rounded-lg px-2 py-1">
              <button 
                onClick={() => setSelectedDate(subDays(selectedDate, 1))}
                className="p-1 hover:bg-zinc-100 rounded transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-medium min-w-[100px] text-center">
                {isToday(selectedDate) ? "Today" : format(selectedDate, "MMM dd, yyyy")}
              </span>
              <button 
                onClick={() => setSelectedDate(subDays(selectedDate, -1))}
                className="p-1 hover:bg-zinc-100 rounded transition-colors"
                disabled={isAfter(selectedDate, subDays(new Date(), -1))}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {habitStats.map((stat, idx) => (
              <motion.div 
                key={stat.habit.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="group bg-white p-4 rounded-xl border border-zinc-200 shadow-sm hover:border-brand/30 transition-all"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => toggleLog(stat.habit.id, selectedDate)}
                      className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                        stat.todayStatus 
                          ? "bg-brand text-white shadow-lg shadow-brand/20" 
                          : "bg-zinc-100 text-zinc-400 hover:bg-zinc-200"
                      )}
                    >
                      {stat.todayStatus ? <CheckCircle2 size={24} /> : <Circle size={24} />}
                    </button>
                    <div>
                      <h3 className="font-semibold">{stat.habit.name}</h3>
                      <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1">
                        <span className="flex items-center gap-1">
                          <Flame size={12} className={stat.streak > 0 ? "text-orange-500" : ""} />
                          {stat.streak} day streak
                        </span>
                        <span className="flex items-center gap-1">
                          <TrendingUp size={12} className="text-emerald-500" />
                          {stat.completionRate}% accuracy
                        </span>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => deleteHabit(stat.habit.id)}
                    className="p-2 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                
                {/* 7 Day History Dots */}
                <div className="flex items-center gap-1.5 pl-14">
                  {stat.history.map((done, i) => (
                    <div 
                      key={i}
                      className={cn(
                        "w-2.5 h-2.5 rounded-full",
                        done ? "bg-brand" : "bg-zinc-100"
                      )}
                      title={format(subDays(new Date(), 6 - i), "MMM dd")}
                    />
                  ))}
                  <span className="text-[10px] text-zinc-400 ml-2 uppercase tracking-wider font-medium">Last 7 days</span>
                </div>
              </motion.div>
            ))}

            {habits.length === 0 && (
              <div className="text-center py-12 bg-zinc-50 border-2 border-dashed border-zinc-200 rounded-2xl">
                <p className="text-zinc-500 mb-4">No habits defined yet.</p>
                <button 
                  onClick={() => setIsModalOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-dark transition-colors"
                >
                  <Plus size={18} />
                  Add Your First Habit
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Visualizations */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
            <h3 className="text-sm font-medium text-zinc-500 uppercase tracking-wider mb-6">Performance Trend</h3>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#a1a1aa' }}
                  />
                  <YAxis 
                    hide 
                    domain={[0, 100]} 
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="rate" 
                    stroke="#10b981" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorRate)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-zinc-500 uppercase tracking-wider">AI Consistency Summary</h3>
              <button 
                onClick={generateAISummary}
                disabled={isGeneratingSummary || habits.length === 0}
                className="p-2 text-brand hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50"
              >
                <Sparkles size={18} className={isGeneratingSummary ? "animate-pulse" : ""} />
              </button>
            </div>
            
            <div className="flex-1 flex flex-col justify-center">
              {aiSummary ? (
                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-sm text-zinc-600 leading-relaxed italic"
                >
                  "{aiSummary}"
                </motion.p>
              ) : (
                <div className="text-center space-y-2">
                  <p className="text-sm text-zinc-400">
                    {isGeneratingSummary ? "Analyzing your patterns..." : "Click the sparkles to get an AI summary of your progress."}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Habit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 overflow-hidden"
            >
              <h2 className="text-xl font-bold mb-6">Add New Habit</h2>
              <form onSubmit={addHabit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Habit Name</label>
                  <input 
                    required
                    type="text"
                    placeholder="e.g. Morning Meditation"
                    className="w-full px-4 py-2 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all"
                    value={newHabit.name}
                    onChange={e => setNewHabit({ ...newHabit, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Description (Optional)</label>
                  <textarea 
                    placeholder="Why is this important to you?"
                    className="w-full px-4 py-2 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all resize-none h-24"
                    value={newHabit.description}
                    onChange={e => setNewHabit({ ...newHabit, description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Frequency</label>
                    <select 
                      className="w-full px-4 py-2 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all"
                      value={newHabit.frequency}
                      onChange={e => setNewHabit({ ...newHabit, frequency: e.target.value })}
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Start Date</label>
                    <input 
                      type="date"
                      className="w-full px-4 py-2 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all"
                      value={newHabit.start_date}
                      onChange={e => setNewHabit({ ...newHabit, start_date: e.target.value })}
                    />
                  </div>
                </div>
                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-4 py-2 border border-zinc-200 text-zinc-600 rounded-lg hover:bg-zinc-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-dark transition-colors font-medium"
                  >
                    Create Habit
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
