import React from 'react';
import { Layers, Printer, Folder, Settings } from 'lucide-react';
import type { NavTab } from '../../types';

interface BottomNavProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'fleet' as NavTab, label: 'Fleet', icon: Layers },
    { id: 'device' as NavTab, label: 'Device', icon: Printer },
    { id: 'files' as NavTab, label: 'Files', icon: Folder },
    { id: 'settings' as NavTab, label: 'Settings', icon: Settings },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#1E1E1E]/95 backdrop-blur-lg border-t border-[#2E2E2E] px-2 py-1 safe-area-pb">
      <div className="flex items-center justify-around h-14">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-1 transition-all ${
                isActive ? 'text-[#00AE42]' : 'text-[#94A3B8] hover:text-[#D1D5DB]'
              }`}
            >
              <div
                className={`flex items-center justify-center w-10 h-6 rounded-full transition-all ${
                  isActive ? 'bg-[#00AE42]/15 text-[#00AE42]' : 'bg-transparent'
                }`}
              >
                <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className={`text-[10px] ${isActive ? 'font-bold' : 'font-medium'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
