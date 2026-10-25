import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AddonContext, AddonEnableFunction } from '@wealthfolio/addon-sdk';
import { Card, CardContent } from '@wealthfolio/ui';
import { ConverterPage } from './pages';
import { t } from './lib/i18n';

let addonCtx: AddonContext | undefined;

function AddonExample({ ctx }: { ctx: AddonContext }) {
  return (
    <div className="p-6">
      <Card>
        <CardContent className="p-6">
          <h1 className="text-2xl font-semibold mb-2">{t('app.title')}</h1>
          <p className="text-muted-foreground">{t('upload.description')}</p>
        </CardContent>
      </Card>
    </div>
  );
}

// Route component. The sidebar entry + route are declared in manifest.json
// (`contributes.routes` + `contributes.links`), so the host renders navigation
// without booting the addon; this component only runs when the route is first
// visited. The QueryClientProvider reuses this addon's isolated cache across
// route navigations; invalidations/refetches are bridged to the host.
const AddonRoute = () => {
  return (
    <QueryClientProvider client={addonCtx!.api.query.getClient() as any}>
      <ConverterPage t={t} files={addonCtx!.api.files} storage={addonCtx!.api.storage} accounts={addonCtx!.api.accounts} activities={addonCtx!.api.activities} navigation={addonCtx!.api.navigation} />
    </QueryClientProvider>
  );
};

const enable: AddonEnableFunction = (ctx) => {
  addonCtx = ctx;

  // The route `id` MUST match `contributes.routes[].id` in manifest.json.
  // The host derives this root path from the manifest addon id.
  ctx.router.add({
    id: 'wealthfolio-addon-report-converter',
    path: '/addons/wealthfolio-addon-report-converter',
    component: AddonRoute,
  });

  // The host owns the React root, so there is nothing to unmount here.
  ctx.onDisable(() => {
    addonCtx = undefined;
  });
};

export default enable;