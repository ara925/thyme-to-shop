import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { RouteSeo } from "@/components/seo/RouteSeo";
import { Skeleton } from "@/components/ui/skeleton";
import { useCartSync } from "@/hooks/useCartSync";

const Index = lazy(() => import("./pages/Index"));
const WeeklyMeals = lazy(() => import("./pages/WeeklyMeals"));
const Juices = lazy(() => import("./pages/Juices"));
const PickAndChoose = lazy(() => import("./pages/PickAndChoose"));
const MealSubscription = lazy(() => import("./pages/MealSubscription"));
const JuiceSubscription = lazy(() => import("./pages/JuiceSubscription"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const About = lazy(() => import("./pages/About"));
const HowItWorks = lazy(() => import("./pages/HowItWorks"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

function AppContent() {
  useCartSync();
  
  return (
    <BrowserRouter>
      <RouteSeo />
      <Suspense
        fallback={
          <div className="min-h-screen" role="status" aria-busy="true">
            <span className="sr-only">Loading page</span>
            <div className="border-b bg-background px-6 py-4" aria-hidden="true">
              <div className="container flex items-center justify-between">
                <Skeleton className="h-11 w-52" />
                <Skeleton className="hidden h-11 w-[38rem] md:block" />
                <Skeleton className="h-11 w-11 rounded-full" />
              </div>
            </div>
            <div className="container space-y-8 py-12" aria-hidden="true">
              <Skeleton className="h-64 w-full rounded-3xl md:h-80" />
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="aspect-[4/5] w-full rounded-2xl" />
                ))}
              </div>
            </div>
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/weekly-meals" element={<WeeklyMeals />} />
          <Route path="/juices" element={<Juices />} />
          <Route path="/juices/pick-and-choose" element={<PickAndChoose />} />
          <Route path="/subscribe/meals" element={<MealSubscription />} />
          <Route path="/subscribe/juices" element={<JuiceSubscription />} />
          <Route path="/product/:handle" element={<ProductDetail />} />
          <Route path="/about" element={<About />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppContent />
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
