"use client";

import { useCallback, useEffect, useState } from "react";
import ServerSelector from "@/components/ServerSelector";

interface Profile {
  id: string;
  name: string;
  servers: string[];
  activeServerIndex: number;
}

export default function HomePage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data: Profile[]) => {
        setProfiles(data);
        if (data.length > 0) setActiveProfile(data[0]);
      })
      .catch(() => {});
  }, []);

  const handleServerChange = useCallback(
    (index: number) => {
      setActiveProfile((prev) =>
        prev ? { ...prev, activeServerIndex: index } : prev,
      );
    },
    [],
  );

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <h1 className="text-lg font-semibold">IPTV Player</h1>
        {activeProfile && (
          <ServerSelector
            profileId={activeProfile.id}
            activeServerIndex={activeProfile.activeServerIndex}
            onServerChange={handleServerChange}
          />
        )}
      </header>
    </main>
  );
}
