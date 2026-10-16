import { useState, useEffect } from 'react';
import BackgroundNetwork from './components/BackgroundNetwork';
import Navbar from './components/Navbar';
import HeroContent from './components/HeroContent';
import KnowledgeGraphPanel from './components/graph/KnowledgeGraphPanel';
import MethodologySection from './components/MethodologySection';
import ProductDemoSection from './components/ProductDemoSection';
import UseCasesSection from './components/UseCasesSection';
import DashboardView from './components/DashboardView';
import OnboardingView from './components/OnboardingView';
import LoginModal from './components/LoginModal';
import DemoModal from './components/DemoModal';

// ==========================================
// REASONCHAIN APP — SINGLE PLATFORM COMPOSITION
// ==========================================

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [currentView, setCurrentView] = useState<'landing' | 'onboarding' | 'workspace'>('workspace');
  const [activeNavTab, setActiveNavTab] = useState('Knowledge Graph');
  
  // Modals state
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isDemoOpen, setIsDemoOpen] = useState(false);

  // Hero knowledge graph step state
  const [activeStep, setActiveStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  const STEP_COUNT = 5;

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % STEP_COUNT);
    }, 4500);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Check workspace onboarding status from backend
  const checkWorkspaceAndNavigate = async () => {
    setCurrentView('workspace');
    setActiveNavTab('KG Builder');
  };

  // Handle Start Investigation Flow
  const handleStartInvestigation = () => {
    if (!isAuthenticated) {
      setIsLoginOpen(true);
    } else {
      checkWorkspaceAndNavigate();
    }
  };

  // Handle Successful Authentication
  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    setIsLoginOpen(false);
    setCurrentView('workspace');
    setActiveNavTab('KG Builder');
  };

  // Handle Logout
  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentView('landing');
  };

  return (
    <div className="min-h-screen bg-[#050a0f] text-slate-100 relative">
      {/* Ambient Background Network */}
      <BackgroundNetwork />

      {/* Subtle radial gradient overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_60%_at_50%_-10%,rgba(6,38,80,0.25),transparent)] pointer-events-none z-0" />

      {/* MAIN RENDER: LANDING, ONBOARDING, OR WORKSPACE */}
      {currentView === 'workspace' && isAuthenticated ? (
        <DashboardView
          onLogout={handleLogout}
          activeNavTab={activeNavTab}
          setActiveNavTab={setActiveNavTab}
        />
      ) : currentView === 'onboarding' && isAuthenticated ? (
        <OnboardingView
          onComplete={() => {
            setCurrentView('workspace');
            setActiveNavTab('Overview');
          }}
          onOpenKnowledgeGraph={() => {
            setCurrentView('workspace');
            setActiveNavTab('Knowledge Graph');
          }}
        />
      ) : (
        <>
          {/* Landing Sticky Navbar */}
          <Navbar
            currentView={currentView === 'workspace' ? 'dashboard' : 'landing'}
            onLoginClick={() => setIsLoginOpen(true)}
            onBookDemoClick={() => setIsDemoOpen(true)}
            onNavigateLanding={() => setCurrentView('landing')}
          />

          {/* Hero Section */}
          <section className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-8 pt-28 pb-16 lg:pt-32 lg:pb-20">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-6 items-stretch">

              {/* Left Column */}
              <HeroContent
                onStartInvestigation={handleStartInvestigation}
                onBookDemo={() => setIsDemoOpen(true)}
              />

              {/* Right Column — Knowledge Graph Preview */}
              <div className="lg:col-span-7 flex flex-col justify-center">
                <KnowledgeGraphPanel
                  activeStep={activeStep}
                  setActiveStep={setActiveStep}
                  isPlaying={isPlaying}
                  setIsPlaying={setIsPlaying}
                />
              </div>

            </div>
          </section>

          {/* Section divider */}
          <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-8">
            <div className="h-px bg-gradient-to-r from-transparent via-[#0e1c2e] to-transparent" />
          </div>

          {/* Methodology Section */}
          <MethodologySection />

          {/* Section divider */}
          <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-8">
            <div className="h-px bg-gradient-to-r from-transparent via-[#0e1c2e] to-transparent" />
          </div>

          {/* Interactive Product Demo Section */}
          <ProductDemoSection />

          {/* Section divider */}
          <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-8">
            <div className="h-px bg-gradient-to-r from-transparent via-[#0e1c2e] to-transparent" />
          </div>

          {/* Use Cases Section */}
          <UseCasesSection />
        </>
      )}

      {/* MODALS */}
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onSuccess={handleLoginSuccess}
      />

      <DemoModal
        isOpen={isDemoOpen}
        onClose={() => setIsDemoOpen(false)}
      />
    </div>
  );
}
