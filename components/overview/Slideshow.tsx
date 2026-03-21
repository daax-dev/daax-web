"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Maximize2,
  Minimize2,
  Play,
  Pause,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface Slide {
  id: string;
  title: string;
  subtitle?: string;
  content: React.ReactNode;
  background?: string; // CSS gradient or color
  icon?: React.ReactNode;
}

interface SlideshowProps {
  slides: Slide[];
  autoPlay?: boolean;
  autoPlayInterval?: number;
  className?: string;
  onSlideChange?: (index: number) => void;
  initialSlide?: number;
}

export interface SlideshowRef {
  goToSlide: (index: number) => void;
  currentIndex: number;
  isFullscreen: boolean;
}

export const Slideshow = forwardRef<SlideshowRef, SlideshowProps>(
  function Slideshow(
    {
      slides,
      autoPlay = false,
      autoPlayInterval = 8000,
      className,
      onSlideChange,
      initialSlide = 0,
    },
    ref,
  ) {
    const router = useRouter();
    const [currentIndex, setCurrentIndex] = useState(initialSlide);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isPlaying, setIsPlaying] = useState(autoPlay);
    const [direction, setDirection] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    const goToSlide = useCallback(
      (index: number) => {
        setDirection(index > currentIndex ? 1 : -1);
        setCurrentIndex(index);
        onSlideChange?.(index);
      },
      [currentIndex, onSlideChange],
    );

    const nextSlide = useCallback(() => {
      const newIndex = (currentIndex + 1) % slides.length;
      setDirection(1);
      setCurrentIndex(newIndex);
      onSlideChange?.(newIndex);
    }, [slides.length, currentIndex, onSlideChange]);

    const prevSlide = useCallback(() => {
      const newIndex = (currentIndex - 1 + slides.length) % slides.length;
      setDirection(-1);
      setCurrentIndex(newIndex);
      onSlideChange?.(newIndex);
    }, [slides.length, currentIndex, onSlideChange]);

    // Navigate to detail page
    const navigateToDetail = useCallback(() => {
      const slide = slides[currentIndex];
      if (slide) {
        // Exit fullscreen before navigating if needed
        if (document.fullscreenElement) {
          document.exitFullscreen().then(() => {
            router.push(`/overview/${slide.id}`);
          });
        } else {
          router.push(`/overview/${slide.id}`);
        }
      }
    }, [slides, currentIndex, router]);

    // Fullscreen handling (must be defined before keyboard navigation useEffect)
    const toggleFullscreen = useCallback(() => {
      if (!document.fullscreenElement) {
        containerRef.current?.requestFullscreen().then(() => {
          // Focus the container after entering fullscreen to ensure keyboard events work
          containerRef.current?.focus();
        });
        setIsFullscreen(true);
      } else {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }, []);

    // Expose methods via ref
    useImperativeHandle(
      ref,
      () => ({
        goToSlide,
        currentIndex,
        isFullscreen,
      }),
      [goToSlide, currentIndex, isFullscreen],
    );

    // Keyboard navigation
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "ArrowRight" || e.key === " ") {
          e.preventDefault();
          nextSlide();
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          prevSlide();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          navigateToDetail();
        } else if (e.key === "f" || e.key === "F") {
          e.preventDefault();
          toggleFullscreen();
        } else if (e.key === "Escape" && isFullscreen) {
          setIsFullscreen(false);
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [
      nextSlide,
      prevSlide,
      navigateToDetail,
      isFullscreen,
      toggleFullscreen,
    ]);

    // Auto-play
    useEffect(() => {
      if (!isPlaying) return;
      const timer = setInterval(nextSlide, autoPlayInterval);
      return () => clearInterval(timer);
    }, [isPlaying, autoPlayInterval, nextSlide]);

    useEffect(() => {
      const handleFullscreenChange = () => {
        setIsFullscreen(!!document.fullscreenElement);
      };
      document.addEventListener("fullscreenchange", handleFullscreenChange);
      return () =>
        document.removeEventListener(
          "fullscreenchange",
          handleFullscreenChange,
        );
    }, []);

    const currentSlide = slides[currentIndex];

    const slideVariants = {
      enter: (direction: number) => ({
        x: direction > 0 ? "100%" : "-100%",
        opacity: 0,
      }),
      center: {
        x: 0,
        opacity: 1,
      },
      exit: (direction: number) => ({
        x: direction > 0 ? "-100%" : "100%",
        opacity: 0,
      }),
    };

    return (
      <div
        ref={containerRef}
        tabIndex={0}
        className={cn(
          "relative overflow-hidden rounded-xl bg-background outline-none",
          isFullscreen ? "fixed inset-0 z-50 rounded-none" : "aspect-[16/9]",
          className,
        )}
      >
        {/* Background gradient */}
        <div
          className="absolute inset-0 transition-all duration-700"
          style={{
            background:
              currentSlide.background ||
              "linear-gradient(135deg, hsl(var(--background)) 0%, hsl(var(--muted)) 100%)",
          }}
        />

        {/* Slide content */}
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentIndex}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: "spring", stiffness: 300, damping: 30 },
              opacity: { duration: 0.2 },
            }}
            className="absolute inset-0 flex flex-col items-center justify-center p-8 md:p-16"
          >
            {/* Icon */}
            {currentSlide.icon && (
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.3 }}
                className="mb-6"
              >
                {currentSlide.icon}
              </motion.div>
            )}

            {/* Title */}
            <motion.h1
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.4 }}
              className="text-3xl md:text-5xl lg:text-6xl font-bold text-center text-foreground mb-4"
            >
              {currentSlide.title}
            </motion.h1>

            {/* Subtitle */}
            {currentSlide.subtitle && (
              <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.25, duration: 0.4 }}
                className="text-lg md:text-xl lg:text-2xl text-muted-foreground text-center max-w-3xl mb-8"
              >
                {currentSlide.subtitle}
              </motion.p>
            )}

            {/* Custom content */}
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.35, duration: 0.4 }}
              className="w-full max-w-5xl"
            >
              {currentSlide.content}
            </motion.div>
          </motion.div>
        </AnimatePresence>

        {/* Navigation arrows */}
        <Button
          variant="ghost"
          size="icon"
          onClick={prevSlide}
          className="absolute left-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-background/50 backdrop-blur-sm hover:bg-background/80"
        >
          <ChevronLeft className="h-6 w-6" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={nextSlide}
          className="absolute right-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-background/50 backdrop-blur-sm hover:bg-background/80"
        >
          <ChevronRight className="h-6 w-6" />
        </Button>

        {/* Down arrow for detail page */}
        <Button
          variant="ghost"
          size="icon"
          onClick={navigateToDetail}
          className="absolute bottom-16 left-1/2 -translate-x-1/2 h-12 w-12 rounded-full bg-background/50 backdrop-blur-sm hover:bg-background/80 animate-bounce"
        >
          <ChevronDown className="h-6 w-6" />
        </Button>

        {/* Bottom controls */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4">
          {/* Progress dots */}
          <div className="flex items-center gap-2">
            {slides.map((_, index) => (
              <button
                key={index}
                onClick={() => goToSlide(index)}
                className={cn(
                  "transition-all duration-300",
                  index === currentIndex
                    ? "w-8 h-2 rounded-full bg-primary"
                    : "w-2 h-2 rounded-full bg-muted-foreground/40 hover:bg-muted-foreground/60",
                )}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Top-right controls */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
          {/* Slide counter */}
          <span className="text-sm text-muted-foreground bg-background/50 backdrop-blur-sm px-3 py-1 rounded-full">
            {currentIndex + 1} / {slides.length}
          </span>

          {/* Play/Pause button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsPlaying(!isPlaying)}
            className="h-8 w-8 rounded-full bg-background/50 backdrop-blur-sm hover:bg-background/80"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>

          {/* Fullscreen button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleFullscreen}
            className="h-8 w-8 rounded-full bg-background/50 backdrop-blur-sm hover:bg-background/80"
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Keyboard hints */}
        <div className="absolute bottom-4 right-4 text-xs text-muted-foreground/60">
          <span className="hidden md:inline">
            <kbd className="px-1.5 py-0.5 rounded bg-muted/50 mr-1">←</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-muted/50 mr-2">→</kbd>
            Navigate
            <span className="mx-2">|</span>
            <kbd className="px-1.5 py-0.5 rounded bg-muted/50 mr-1">↓</kbd>
            Details
            <span className="mx-2">|</span>
            <kbd className="px-1.5 py-0.5 rounded bg-muted/50 mr-1">F</kbd>
            Fullscreen
          </span>
        </div>
      </div>
    );
  },
);
