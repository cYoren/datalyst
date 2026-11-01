import type { CapacitorConfig } from '@capacitor/cli';

// The native shells load the live site. www.datalyst.one is canonical (the apex
// 307s to it), so pointing here saves a redirect and keeps cookies on one host.
const config: CapacitorConfig = {
  appId: 'com.datalyst.app',
  appName: 'Datalyst',
  webDir: 'www',
  server: {
    url: 'https://www.datalyst.one/dashboard',
    cleartext: false,
    androidScheme: 'https'
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_datalyst',
    },
  },
};

export default config;
