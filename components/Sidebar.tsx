"use client";

import { ChevronRight, ChevronDown, X } from "lucide-react";
import { useState } from "react";

interface Category {
  category_id: string;
  category_name: string;
  parent_id: number;
}

interface SidebarProps {
  sections: string[];
  selectedSection: string;
  onSectionChange: (section: string) => void;
  groupedCategories: Record<string, Category[]>;
  selectedCategory: string | null;
  onCategoryClick: (catId: string) => void;
  onCategoryDoubleClick?: (catId: string) => void;
  open?: boolean;
  onClose?: () => void;
}

const SECTION_LABELS: Record<string, string> = {
  live: "Live",
  vod: "VOD",
  series: "Series",
};

export default function Sidebar({
  sections,
  selectedSection,
  onSectionChange,
  groupedCategories,
  selectedCategory,
  onCategoryClick,
  onCategoryDoubleClick,
  open = false,
  onClose,
}: SidebarProps) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (prefix: string) => {
    setExpandedGroups((prev) => ({ ...prev, [prefix]: !prev[prefix] }));
  };

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex w-64 transform flex-col border-r border-gray-200 bg-gray-50 transition-transform duration-200 md:static md:z-auto md:translate-x-0 dark:border-gray-800 dark:bg-gray-900 ${
        open ? "translate-x-0 shadow-xl" : "-translate-x-full md:shadow-none"
      }`}
    >
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 md:hidden dark:border-gray-800">
        <span className="text-sm font-semibold">Categories</span>
        <button
          onClick={onClose}
          className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          title="Close menu"
        >
          <X size={18} />
        </button>
      </div>
      <div className="flex border-b border-gray-200 dark:border-gray-800">
        {sections.map((s) => (
          <button
            key={s}
            onClick={() => onSectionChange(s)}
            className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
              selectedSection === s
                ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            {SECTION_LABELS[s] ?? s}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {Object.entries(groupedCategories)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([prefix, cats]) => (
            <div key={prefix}>
              <button
                onClick={() => toggleGroup(prefix)}
                className="flex w-full items-center gap-1 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                {expandedGroups[prefix] ? (
                  <ChevronDown size={12} />
                ) : (
                  <ChevronRight size={12} />
                )}
                {prefix}
              </button>
              {expandedGroups[prefix] &&
                cats.map((cat) => (
                  <button
                    key={cat.category_id}
                    onClick={() => onCategoryClick(cat.category_id)}
                    onDoubleClick={() => onCategoryDoubleClick?.(cat.category_id)}
                    className={`block w-full truncate px-3 py-1 pl-8 text-left text-sm transition-colors ${
                      selectedCategory === cat.category_id
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                        : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                    }`}
                  >
                    {cat.category_name}
                  </button>
                ))}
            </div>
          ))}
      </div>
    </aside>
  );
}
