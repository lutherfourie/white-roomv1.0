
import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';

interface InterfaceProps {
    isLocked: boolean;
    gazePressure: number;
    isListening: boolean;
    transcript: string;
}

const Interface: React.FC<InterfaceProps> = ({ isLocked, gazePressure, isListening, transcript }) => {
    const titleRef = useRef<HTMLHeadingElement>(null);
    const subRef = useRef<HTMLParagraphElement>(null);
    const voiceRef = useRef<HTMLDivElement>(null);

    // GSAP Transition for HUD
    useEffect(() => {
        if (isLocked) {
            gsap.to([titleRef.current, subRef.current], { opacity: 0, y: -20, duration: 0.5, stagger: 0.1, ease: "power2.in" });
        } else {
            gsap.fromTo([titleRef.current, subRef.current], 
                { opacity: 0, y: 20 },
                { opacity: 1, y: 0, duration: 0.8, stagger: 0.2, ease: "back.out(1.7)" }
            );
        }
    }, [isLocked]);

    // Voice UI Animation
    useEffect(() => {
        if (isListening) {
            gsap.to(voiceRef.current, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out" });
        } else {
            gsap.to(voiceRef.current, { opacity: 0, scale: 0.8, duration: 0.2 });
        }
    }, [isListening]);

    return (
        <div className="absolute inset-0 pointer-events-none">
            {/* RETICLE */}
            <div 
                className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-yellow-500/40 transition-all duration-200 ease-out
                ${isLocked ? 'w-[6px] h-[6px] bg-yellow-500 border-none shadow-[0_0_10px_#ffcc00]' : 'w-10 h-10'}
                ${gazePressure > 0 ? 'border-orange-500 animate-pulse scale-110' : ''}
                `}
            />

            {/* CENTER HUD */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center mix-blend-screen">
                <h1 ref={titleRef} className="text-yellow-500 text-base tracking-[4px] uppercase m-0 shadow-yellow-500/80 drop-shadow-[0_0_10px_rgba(255,204,0,0.8)] font-bold">
                    Initiating Creation Protocol
                </h1>
                <p ref={subRef} className="text-[10px] text-[#ccaa55] mt-2 font-mono">
                    CLICK TO ENTER - USE GAZE TO POWER THE CORE
                </p>
            </div>

            {/* VOICE COMMAND OVERLAY */}
            <div ref={voiceRef} className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center opacity-0 scale-75">
                <div className="w-16 h-16 mx-auto bg-red-500/20 rounded-full border border-red-500 flex items-center justify-center animate-pulse shadow-[0_0_30px_#ff0000]">
                    <div className="w-2 h-8 bg-red-500 mx-1 animate-[bounce_1s_infinite]" />
                    <div className="w-2 h-12 bg-red-500 mx-1 animate-[bounce_1.2s_infinite]" />
                    <div className="w-2 h-8 bg-red-500 mx-1 animate-[bounce_1s_infinite]" />
                </div>
                <h2 className="text-red-400 font-bold tracking-widest mt-4 text-xl">LISTENING</h2>
                <p className="text-white font-mono text-sm max-w-md mt-2 bg-black/50 p-2 rounded">
                    {transcript || "Speak to the Core..."}
                </p>
            </div>
            
            <div className="absolute top-4 left-4 text-white/30 font-mono text-xs pointer-events-none">
                <p>WASD to Move</p>
                <p>Hold 'V' to Speak</p>
                <p>Look at Core to Activate</p>
            </div>
        </div>
    );
};

export default Interface;
