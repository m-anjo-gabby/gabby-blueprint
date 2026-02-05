'use client';

import { useState } from 'react';
import TrainingCard from '@/components/student/CorpusCard';

// 実際にはDB(phrases)のcategoryやsectionから取得
const SECTIONS = [
  { id: 'SEMI', name: 'Semiconductors', desc: 'SiC Power Devices & Substrates' },
  { id: 'FA', name: 'Factory Automation', desc: 'PLC & Industrial Robots' },
  { id: 'ENERGY', name: 'Energy & Buildings', icon: '⚡' },
];

export default function StudentDashboard() {
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  if (selectedSection) {
    return (
      <TrainingCard 
        sectionId={selectedSection} 
        onBack={() => setSelectedSection(null)} 
      />
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 bg-indigo-600 rounded-2xl mx-auto flex items-center justify-center text-white font-black text-xl shadow-lg">G</div>
        <h1 className="text-2xl font-bold text-slate-900">Training Menu</h1>
        <p className="text-sm text-slate-500">学習するセクションを選択してください</p>
      </div>

      <div className="grid gap-3">
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            onClick={() => setSelectedSection(section.id)}
            className="w-full text-left p-6 bg-white rounded-[24px] border border-slate-100 shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all group"
          >
            <span className="block font-bold text-slate-800 text-lg group-hover:text-indigo-600">{section.name}</span>
            <span className="block text-xs text-slate-400 mt-1">{section.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}