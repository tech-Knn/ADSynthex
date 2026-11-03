import DefaultLaunchSetup from '@/components/AdLauncher/DefaultLaunchSetup';
import ArticleQueue from '@/components/AdLauncher/ArticleQueue';
import Connections from '@/components/AdLauncher/Connections';

export default function AdLauncherPage() {
  return (
    <div>
      <div className="page-head">
        <h1>Ads Launcher</h1>
        <p>Configure your default setup, then launch campaigns per article.</p>
      </div>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 420px', maxWidth: 520 }}>
          <Connections />
          <DefaultLaunchSetup />
        </div>
        <div style={{ flex: '2 1 520px', minWidth: 0 }}>
          <ArticleQueue />
        </div>
      </div>
    </div>
  );
}