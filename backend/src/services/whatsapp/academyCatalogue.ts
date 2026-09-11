// BSOE AI Academy's public content site (GitHub Pages) and its payment-based
// enrolment flow, for the professional/adult catalogue. The Teens Academy is
// a separate programme with its own content, not yet built — see the
// safeguarding rule in brands.ts.
//
// All URLs verified reachable (200) on 2026-09-11.

export const ACADEMY_LANDING_URL = 'https://nigeriastudentcenter.github.io/AI-Academy/landingpage.html';
export const ACADEMY_LEARNER_GUIDE_URL = 'https://nigeriastudentcenter.github.io/AI-Academy/LearnerGuide.html';
export const ACADEMY_CATALOGUE_URL = 'https://nigeriastudentcenter.github.io/AI-Academy/landingpage.html?v=2#catalogue';
// A Paystack storefront — one link, prices shown per item at checkout.
// Registration completes automatically once payment is confirmed; no
// separate signup form for this catalogue.
export const ACADEMY_PAYMENT_URL = 'https://paystack.shop/pay/bsoeaiacademy';

export interface AcademyCourse {
  title: string;
  url: string;
  /** Free taster lesson rather than a paid course. */
  free?: boolean;
}

// Order: foundations, the flagship engineering track, role-based tracks,
// career tools, then sales/customer-engagement and the mastery programme.
export const ACADEMY_COURSES: AcademyCourse[] = [
  { title: 'AI Foundations', url: 'https://nigeriastudentcenter.github.io/AI-Academy/AIFoundations.html' },
  { title: '10 Popular AI Tools', url: 'https://nigeriastudentcenter.github.io/AI-Academy/AIToolbox.html' },
  { title: 'AI Engineering Course', url: 'https://nigeriastudentcenter.github.io/AI-Academy/AzureAIEngineer.html' },
  { title: 'AI for Admins', url: 'https://nigeriastudentcenter.github.io/AI-Academy/AIForAdmins.html' },
  { title: 'AI in Health Services', url: 'https://nigeriastudentcenter.github.io/AI-Academy/AIHealthcare.html' },
  { title: 'AI for IT Professionals', url: 'https://nigeriastudentcenter.github.io/AI-Academy/AIForITDevelopers.html' },
  { title: 'AI in Product Management', url: 'https://nigeriastudentcenter.github.io/AI-Academy/AIForProductManagers.html' },
  { title: 'AI in Business Analysis', url: 'https://nigeriastudentcenter.github.io/AI-Academy/AIForBusinessAnalysts.html' },
  { title: 'AI in Data Analysis', url: 'https://nigeriastudentcenter.github.io/AI-Academy/AIForDataAnalysts.html' },
  { title: 'AI for HR', url: 'https://bsoedu.org/ai-for-hr-syllabus/' },
  {
    title: 'AI for Business (Marketing & Sales)',
    url: 'https://nigeriastudentcenter.github.io/AI-Academy/AIForBusinessMarketingSales.html',
  },
  { title: 'AI in Finance', url: 'https://nigeriastudentcenter.github.io/AI/ai-readiness/finance.html' },
  {
    title: 'AI-Enabled Project Management',
    url: 'https://nigeriastudentcenter.github.io/AI-Academy/AIEnabledProjectManagement.html',
  },
  { title: 'AI for Junior Lawyers', url: 'https://nigeriastudentcenter.github.io/AI-Academy/LegalAIAccelerator.html' },
  { title: 'Advanced AI for Legal', url: 'https://nigeriastudentcenter.github.io/AI-Academy/LegalAIFastTrack.html' },
  {
    title: 'AI to Tailor Your CV to Beat the ATS',
    url: 'https://nigeriastudentcenter.github.io/AI-Academy/BeatATS.html',
    free: true,
  },
  {
    title: 'AI Interview Coach',
    url: 'https://nigeriastudentcenter.github.io/AI-Academy/InterviewPrep.html',
    free: true,
  },
  { title: 'AI for Work — Skills Portfolio', url: 'https://nigeriastudentcenter.github.io/AI-Academy/AISkillsPortfolio.html' },
  {
    title: 'Using AI to Research a Company Before an Interview',
    url: 'https://nigeriastudentcenter.github.io/AI-Academy/ResearchCompanyBeforeInterview.html',
  },
  { title: 'AI in Sales', url: 'https://nigeriastudentcenter.github.io/AI-Academy/HumanAIIntelligenceInSales.html' },
  {
    title: 'AI Agents & the Future of Customer Engagement',
    url: 'https://nigeriastudentcenter.github.io/AI-Academy/AIAgentsandCustomerEngagement.html',
  },
  {
    title: 'AI Engineering & Agentic Systems Mastery Programme',
    url: 'https://nigeriastudentcenter.github.io/AI-Academy/AIEngineeringMastery.html',
  },
];

export function findAcademyCourse(title: string): AcademyCourse | undefined {
  return ACADEMY_COURSES.find((c) => c.title === title);
}
