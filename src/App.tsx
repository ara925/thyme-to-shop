import { lazy, Suspense } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { RouteAccessibility } from "@/components/seo/RouteAccessibility";
import { RouteSeo } from "@/components/seo/RouteSeo";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useCartSync } from "@/hooks/useCartSync";

const Index = lazy(() => import("./pages/Index"));
const WeeklyMeals = lazy(() => import("./pages/WeeklyMeals"));
const Juices = lazy(() => import("./pages/Juices"));
const MealSubscription = lazy(() => import("./pages/MealSubscription"));
const JuiceSubscription = lazy(() => import("./pages/JuiceSubscription"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const About = lazy(() => import("./pages/About"));
const HowItWorks = lazy(() => import("./pages/HowItWorks"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

function PageLoadingFallback() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      aria-busy="true"
      className="flex min-h-[50vh] items-center justify-center px-4"
    >
      <p role="status" aria-live="polite" className="text-sm font-semibold text-muted-foreground">
        Loading page…
      </p>
    </main>
  );
}

function AppContent() {
  useCartSync();
  
  return (
    <BrowserRouter>
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-md bg-primary px-4 py-3 font-semibold text-primary-foreground shadow-lg shadow-shadow/20 transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        Skip to main content
      </a>
      <RouteSeo />
      <RouteAccessibility />
      <Suspense fallback={<PageLoadingFallback />}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/weekly-meals" element={<WeeklyMeals />} />
          <Route path="/juices" element={<Juices />} />
          <Route path="/subscribe/meals" element={<MealSubscription />} />
          <Route path="/subscribe/juices" element={<JuiceSubscription />} />
          <Route path="/product/:handle" element={<ProductDetail />} />
          <Route path="/about" element={<About />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route
            path="*"
            element={
              <main id="main-content" tabIndex={-1}>
                <NotFound />
              </main>
            }
          />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <Sonner />
    <AppContent />
  </QueryClientProvider>
);

export default App;
