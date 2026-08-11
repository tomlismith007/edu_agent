import { ProfileSection } from './settings/ProfileSection';
import { LlmSection } from './settings/LlmSection';
import { RagSection } from './settings/RagSection';
import { ThemeSection } from './settings/ThemeSection';
import { CacheSection } from './settings/CacheSection';

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <ProfileSection />
      <LlmSection />
      <RagSection />
      <ThemeSection />
      <CacheSection />
    </div>
  );
}
