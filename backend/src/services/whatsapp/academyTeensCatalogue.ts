// AI Academy for Teens — public pages, sourced from the real curriculum on
// the TeenSkills SharePoint site (bsoed.sharepoint.com/sites/TeenSkills),
// published alongside the adult catalogue (see academyCatalogue.ts). No
// self-serve payment link is known for this programme yet — enrolment goes
// through capture_academy_lead, a human confirms the place.
//
// All URLs verified reachable (200) on 2026-09-11.

export const TEENS_CURRICULUM_URL = 'https://nigeriastudentcenter.github.io/AI-Academy/TeensCurriculum.html';
export const TEENS_SAFETY_URL = 'https://nigeriastudentcenter.github.io/AI-Academy/TeensAISafety.html';
export const TEENS_SEL_URL = 'https://nigeriastudentcenter.github.io/AI-Academy/TeensSEL.html';

export interface TeensTrack {
  title: string;
  url: string;
}

export const TEENS_TRACKS: TeensTrack[] = [
  { title: 'Track 1 — AI Foundations', url: 'https://nigeriastudentcenter.github.io/AI-Academy/TeensTrack1Foundations.html' },
  {
    title: 'Track 2 — Prompt Engineering & Chatbots',
    url: 'https://nigeriastudentcenter.github.io/AI-Academy/TeensTrack2PromptEngineering.html',
  },
  { title: 'Track 3 — Build with AI (no-code)', url: 'https://nigeriastudentcenter.github.io/AI-Academy/TeensTrack3BuildWithAI.html' },
  { title: 'Track 4 — AI for Creativity', url: 'https://nigeriastudentcenter.github.io/AI-Academy/TeensTrack4Creativity.html' },
];

export function findTeensTrack(title: string): TeensTrack | undefined {
  return TEENS_TRACKS.find((t) => t.title === title);
}
