import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

export default function LoadingSplash() {
  const router = useRouter();
  const [statusText, setStatusText] = useState("Connecting to marine sensors...");
  const statusIndexRef = useRef(0);

  const loadingMessages = [
    "Connecting to marine sensors...",
    "Loading Sri Lanka coastal data...",
    "Fetching live wave conditions...",
    "Calibrating AI safety models...",
    "Almost ready...",
  ];

  // Cycle through status messages every 700ms
  useEffect(() => {
    const interval = setInterval(() => {
      statusIndexRef.current = (statusIndexRef.current + 1) % loadingMessages.length;
      setStatusText(loadingMessages[statusIndexRef.current]);
    }, 700);

    return () => clearInterval(interval);
  }, []);

  // Navigate to /search after 3.2 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      router.push("/search");
    }, 3200);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <>
      <Head>
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;800&family=Space+Grotesk:wght@600;700&family=Inter:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
      </Head>
      <div className="relative w-screen h-screen overflow-hidden select-none">
        {/* Background Photo with Slow Zoom */}
        <div
          className="fixed inset-0 z-0"
          style={{
            backgroundImage: "url('/ocean-bg.png')",
            backgroundSize: "cover",
            backgroundPosition: "center 40%",
            backgroundRepeat: "no-repeat",
            animation: "slowZoom 8s ease-out forwards",
          }}
        />

        {/* Dark Gradient Overlay for Text Legibility */}
        <div
          className="fixed inset-0 z-10"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.05) 30%, rgba(0,0,0,0.1) 55%, rgba(0,10,30,0.75) 80%, rgba(0,5,20,0.92) 100%)",
          }}
        />

        {/* Subtle Vignette Overlay */}
        <div
          className="fixed inset-0 z-10"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.3) 100%)",
          }}
        />

        {/* Content Layer */}
        <div className="relative z-20 w-screen h-screen flex flex-col items-center justify-center px-6 text-center select-none">

          {/* Logo and Name Container */}
          <div
            className="flex flex-col items-center mb-6"
            style={{
              animation: "fadeIn 1s ease both",
            }}
          >
            <img
              src="/logo-v2.png"
              alt="WaveLanka"
              style={{
                width: "180px",
                height: "auto",
                filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.5))",
                marginBottom: "12px",
              }}
            />
            <span
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: "clamp(2.4rem, 6vw, 3.6rem)",
                fontWeight: 700,
                color: "#ffffff",
                letterSpacing: "0.5px",
                textShadow: "0 2px 12px rgba(0,0,0,0.5)",
                animation: "fadeIn 1.2s ease both",
              }}
            >
              WaveLanka
            </span>
          </div>

          {/* Main Content Info */}
          <div
            className="flex flex-col items-center max-w-xl"
            style={{}}
          >
            {/* Headline with Word-by-Word Animation */}
            <h1
              style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: "clamp(1.6rem, 4vw, 2.4rem)",
                fontWeight: 700,
                color: "#ffffff",
                lineHeight: 1.2,
                letterSpacing: "-0.5px",
                textShadow: "0 2px 20px rgba(0,0,0,0.4)",
                margin: 0,
                padding: 0,
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  animation: "wordFadeUp 0.6s ease both",
                  animationDelay: "0.2s",
                }}
              >
                Read
              </span>
              {" "}
              <span
                style={{
                  display: "inline-block",
                  animation: "wordFadeUp 0.6s ease both",
                  animationDelay: "0.5s",
                }}
              >
                the
              </span>
              {" "}
              <span
                style={{
                  display: "inline-block",
                  animation: "wordFadeUp 0.6s ease both",
                  animationDelay: "0.8s",
                }}
              >
                Sea.
              </span>
              {" "}
              <span
                style={{
                  display: "inline-block",
                  animation: "wordFadeUp 0.6s ease both",
                  animationDelay: "1.1s",
                }}
              >
                Stay
              </span>
              {" "}
              <span
                style={{
                  display: "inline-block",
                  animation: "wordFadeUp 0.6s ease both",
                  animationDelay: "1.4s",
                }}
              >
                Safe.
              </span>
            </h1>

            {/* Subtitle */}
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: "0.9rem",
                fontWeight: 400,
                color: "rgba(255,255,255,0.75)",
                letterSpacing: "0.3px",
                marginTop: "14px",
                animation: "fadeUp 0.8s 1.6s ease both",
                margin: "14px 0 0 0",
                padding: 0,
              }}
            >
              Real-time marine safety and AI forecasts for Sri Lanka's coastal waters.
            </p>

            {/* Loading Bar */}
            <div className="flex flex-col items-center mt-8">
              {/* Bar Track */}
              <div
                style={{
                  height: "2px",
                  background: "rgba(255,255,255,0.15)",
                  borderRadius: "1px",
                  overflow: "hidden",
                  width: "240px",
                }}
              >
                {/* Bar Fill */}
                <div
                  style={{
                    height: "100%",
                    width: "100%",
                    background: "linear-gradient(90deg, rgba(255,160,50,0.8), rgba(255,220,100,0.9), #ffffff)",
                    borderRadius: "1px",
                    animation: "fillBar 2.8s cubic-bezier(0.4,0,0.2,1) forwards",
                    animationDelay: "0.8s",
                  }}
                />
              </div>

              {/* Status Text */}
              <p
                style={{
                  marginTop: "10px",
                  fontSize: "0.68rem",
                  fontWeight: 400,
                  color: "rgba(255,255,255,0.45)",
                  letterSpacing: "0.8px",
                  textTransform: "none",
                  animation: "fadeIn 0.5s 1s ease both",
                  margin: "10px 0 0 0",
                  padding: 0,
                  minHeight: "0.8rem",
                }}
              >
                {statusText}
              </p>
            </div>
          </div>
        </div>

        {/* Global Styles - Animations */}
        <style>{`
        @keyframes slowZoom {
          0% {
            transform: scale(1.0);
          }
          100% {
            transform: scale(1.08);
          }
        }

        @keyframes wordFadeUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes fillBar {
          0% {
            width: 0%;
          }
          30% {
            width: 35%;
          }
          60% {
            width: 65%;
          }
          85% {
            width: 88%;
          }
          100% {
            width: 100%;
          }
        }

        /* Mobile Responsive */
        @media (max-width: 480px) {
          .fixed {
            position: fixed;
          }
        }
      `}</style>
      </div>
    </>
  );
}
