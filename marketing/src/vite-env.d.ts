/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_LANDLORD_PORTAL_URL?: string;
  readonly VITE_TENANT_PORTAL_URL?: string;
  /** YouTube/Vimeo watch URL or a direct .mp4 for the homepage walkthrough.
   *  Unset => the "video coming soon" placeholder is shown. */
  readonly VITE_WALKTHROUGH_VIDEO_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
