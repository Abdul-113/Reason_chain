import { useState, useEffect } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ==========================================
// PREMIUM STICKY NAVBAR
// ==========================================

interface NavbarProps {
  currentView?: string;
  onLoginClick: () => void;
  onBookDemoClick: () => void;
  onNavigateLanding: () => void;
}

export default function Navbar({ onLoginClick, onBookDemoClick, onNavigateLanding }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = ['Platform', 'Use Cases', 'How It Works', 'Resources', 'Pricing'];

  return (
    <motion.nav
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 border-b ${
        scrolled
          ? 'bg-[#050a0f]/92 backdrop-blur-lg border-[#0e1c2e]'
          : 'bg-[#050a0f]/30 backdrop-blur-sm border-transparent'
      }`}
      style={{ height: '72px' }}
    >
      <div className="max-w-[1400px] mx-auto px-6 lg:px-8 h-full flex items-center justify-between">

        {/* Logo */}
        <div 
          onClick={onNavigateLanding}
          className="flex items-center gap-3 cursor-pointer group"
        >
          <div className="relative flex items-center justify-center w-9 h-9 rounded-md border border-cyan-500/30 bg-[#08152b] shadow-[0_0_12px_rgba(6,182,212,0.2)] group-hover:border-cyan-500/60 transition-colors">
            <span className="font-mono text-sm font-black text-cyan-400 tracking-tight">RC</span>
          </div>
          <span className="font-sans text-[13px] font-bold tracking-[0.22em] text-slate-100 uppercase">
            ReasonChain
          </span>
        </div>

        {/* Desktop Navigation */}
        <div className="hidden lg:flex items-center gap-9">
          {links.map((link) => (
            <a
              key={link}
              href={`#${link.toLowerCase().replace(/\s+/g, '-')}`}
              onClick={onNavigateLanding}
              className="text-[12.5px] font-medium tracking-wide text-slate-400 hover:text-slate-100 transition-colors duration-200 relative group"
            >
              {link}
              <span className="absolute -bottom-1 left-0 w-0 h-px bg-cyan-400 group-hover:w-full transition-all duration-300" />
            </a>
          ))}
        </div>

        {/* Desktop CTAs */}
        <div className="hidden lg:flex items-center gap-5">
          <button 
            onClick={onLoginClick}
            className="text-[12.5px] font-medium text-slate-400 hover:text-slate-200 transition-colors"
          >
            Log in
          </button>
          <button 
            onClick={onBookDemoClick}
            className="group flex items-center gap-1.5 px-5 py-2.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-[12px] font-semibold tracking-wide transition-all duration-300 shadow-[0_0_20px_rgba(37,99,235,0.2)]"
          >
            Book a Demo
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform duration-200" />
          </button>
        </div>

        {/* Mobile Toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="lg:hidden text-slate-400 hover:text-slate-200 p-2"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden bg-[#050a0f] border-b border-[#0e1c2e] px-6 pb-6 space-y-2"
          >
            {links.map((link) => (
              <a
                key={link}
                href={`#${link.toLowerCase().replace(/\s+/g, '-')}`}
                onClick={() => {
                  onNavigateLanding();
                  setMobileOpen(false);
                }}
                className="block text-sm font-medium text-slate-400 hover:text-slate-100 py-2.5 transition-colors"
              >
                {link}
              </a>
            ))}
            <div className="pt-4 border-t border-[#0e1c2e] space-y-3">
              <button 
                onClick={() => {
                  onLoginClick();
                  setMobileOpen(false);
                }}
                className="w-full text-sm font-medium text-slate-400 hover:text-slate-200 py-2.5"
              >
                Log in
              </button>
              <button 
                onClick={() => {
                  onBookDemoClick();
                  setMobileOpen(false);
                }}
                className="w-full py-2.5 rounded-md bg-blue-600 text-white text-sm font-semibold"
              >
                Book a Demo
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
