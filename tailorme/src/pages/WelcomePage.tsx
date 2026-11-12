import SiteHeader from '../components/SiteHeader';
import HeroSection from '../components/HeroSection';
import ValueProposition from '../components/ValueProposition';
import CollectionsSection from '../components/CollectionsSection';
import NewsletterSection from '../components/NewsletterSection';
import SiteFooter from '../components/SiteFooter';
export default function WelcomePage() { return <div className="landing-page" id="top"><a className="skip-link" href="#main-content">Skip to content</a><SiteHeader /><main id="main-content" className="pt-20"><HeroSection /><ValueProposition /><CollectionsSection /><NewsletterSection /></main><SiteFooter /></div>; }
