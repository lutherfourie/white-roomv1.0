
import React, { useEffect, useRef } from 'react';
import * as Tone from 'tone';

interface AudioManagerProps {
    isLocked: boolean;
    gazePressure: number;
    portalOpen: boolean;
}

const AudioManager: React.FC<AudioManagerProps> = ({ isLocked, gazePressure, portalOpen }) => {
    const isSetup = useRef(false);
    
    // Musical Instruments
    const padSynth = useRef<Tone.PolySynth | null>(null);
    const bassSynth = useRef<Tone.MonoSynth | null>(null);
    const arpSynth = useRef<Tone.PolySynth | null>(null);
    
    // FX & Atmosphere
    const ambienceSynth = useRef<Tone.Noise | null>(null);
    const coreSynth = useRef<Tone.FMSynth | null>(null);
    const coreDrive = useRef<Tone.Chebyshev | null>(null);
    const reverb = useRef<Tone.Reverb | null>(null);
    const delay = useRef<Tone.PingPongDelay | null>(null);
    const filter = useRef<Tone.AutoFilter | null>(null);

    // Sequencers
    const chordSequence = useRef<Tone.Sequence | null>(null);
    const arpSequence = useRef<Tone.Sequence | null>(null);
    const coreSignal = useRef(false);

    // --- MUSICAL THEME (NEBULA) ---
    // Deep, cinematic, "Blade Runner" vibe (C Minor)
    const THEME = {
        bpm: 65,
        progression: [
            { time: "0:0", chord: ["C3", "G3", "Eb4", "G4"], bass: "C2" }, // Cm
            { time: "4:0", chord: ["Ab2", "Eb3", "Ab3", "C4"], bass: "Ab1" }, // Ab Maj
            { time: "8:0", chord: ["F2", "C3", "Eb3", "G3"], bass: "F1" },   // Fm9
            { time: "12:0", chord: ["G2", "D3", "F3", "Bb3"], bass: "G1" },  // G7sus
        ],
        arpNotes: ["C5", "Eb5", "G5", "Bb5", "C6"],
        arpPattern: [true, false, true, true, false, true, false, false]
    };

    // --- SETUP ---
    useEffect(() => {
        // Only initialize on first interaction (lock) to respect AudioContext policy
        if (isSetup.current || !isLocked) return;
        
        const initAudio = async () => {
            try {
                await Tone.start();
            } catch (e) {
                console.warn("Tone.start() failed or was blocked", e);
            }
            
            // Master Effects
            const masterVol = new Tone.Volume(-5).toDestination();
            const limiter = new Tone.Limiter(-1).connect(masterVol);
            
            reverb.current = new Tone.Reverb({ decay: 8, wet: 0.5 }).connect(limiter);
            await reverb.current.generate();
            
            delay.current = new Tone.PingPongDelay("8n.", 0.2).connect(reverb.current);

            // 1. LUSH PAD SYNTH (Chords)
            padSynth.current = new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: "fatcustom", count: 3, spread: 20, partials: [1, 0.8, 0.3] },
                envelope: { attack: 2.5, decay: 1, sustain: 0.8, release: 4 }
            }).connect(reverb.current);
            padSynth.current.volume.value = -18;

            // 2. DEEP BASS SYNTH
            bassSynth.current = new Tone.MonoSynth({
                oscillator: { type: "triangle" },
                envelope: { attack: 0.5, decay: 1, sustain: 0.8, release: 2 },
                filter: { type: "lowpass", frequency: 200, rolloff: -24 }
            }).connect(limiter);
            bassSynth.current.volume.value = -12;

            // 3. ARP / MELODY SYNTH
            arpSynth.current = new Tone.PolySynth(Tone.AMSynth, {
                harmonicity: 2.5,
                oscillator: { type: "sine" },
                envelope: { attack: 0.05, decay: 0.2, sustain: 0.1, release: 1 },
                modulation: { type: "square" },
                modulationEnvelope: { attack: 0.05, decay: 0.2, sustain: 0.1, release: 0.5 }
            }).connect(delay.current);
            arpSynth.current.volume.value = -20;

            // 4. AMBIENCE
            filter.current = new Tone.AutoFilter({ frequency: 0.1, depth: 0.4, baseFrequency: 200 }).connect(reverb.current).start();
            ambienceSynth.current = new Tone.Noise({ type: "pink", volume: -24 }).connect(filter.current);
            ambienceSynth.current.fadeIn = 4;

            // 5. CORE FX (Reactive)
            coreDrive.current = new Tone.Chebyshev(30).connect(reverb.current);
            coreSynth.current = new Tone.FMSynth({
                harmonicity: 3.01,
                modulationIndex: 10,
                oscillator: { type: "sine" },
                envelope: { attack: 0.1, decay: 0.1, sustain: 1, release: 1 },
                modulation: { type: "square" }
            }).connect(coreDrive.current);
            coreSynth.current.volume.value = -Infinity;

            isSetup.current = true;
            
            // Trigger start logic for the first time
            Tone.Transport.start();
            ambienceSynth.current?.start();
        };
        initAudio();

        return () => {
            // Cleanup on unmount (rarely happens in this app lifecycle)
            Tone.Transport.stop();
            chordSequence.current?.dispose();
            arpSequence.current?.dispose();
            padSynth.current?.dispose();
            bassSynth.current?.dispose();
            arpSynth.current?.dispose();
        };
    }, [isLocked]); // Depend on isLocked to trigger start

    // --- SEQUENCER MANAGEMENT ---
    useEffect(() => {
        if (!isLocked || !isSetup.current) return;
        
        // 1. Cleanup old sequences
        chordSequence.current?.dispose();
        arpSequence.current?.dispose();
        padSynth.current?.releaseAll();
        bassSynth.current?.triggerRelease();

        Tone.Transport.bpm.rampTo(THEME.bpm, 2);

        // 2. Chord Sequence
        // Schedules chords and bass every 4 bars (assuming 4/4)
        chordSequence.current = new Tone.Sequence((time, step) => {
            // Trigger Chord
            padSynth.current?.triggerAttackRelease(step.chord, "1m", time, 0.6);
            // Trigger Bass
            bassSynth.current?.triggerAttackRelease(step.bass, "1m", time, 0.8);
        }, THEME.progression, "1m").start(0);

        // 3. Arp Sequence
        // 16th notes grid
        arpSequence.current = new Tone.Sequence((time, idx) => {
            // Check pattern for silence
            const shouldPlay = THEME.arpPattern[idx % THEME.arpPattern.length];
            
            // Add some randomness
            if (shouldPlay && Math.random() > 0.2) {
                // Pick random note from scale
                const note = THEME.arpNotes[Math.floor(Math.random() * THEME.arpNotes.length)];
                // Vary velocity
                const vel = Math.random() * 0.4 + 0.3;
                arpSynth.current?.triggerAttackRelease(note, "16n", time, vel);
            }
        }, Array.from({length: 16}, (_, i) => i), "8n").start(0);

    }, [isLocked]);

    // --- PLAYBACK CONTROL ---
    useEffect(() => {
        if (!isSetup.current) return;

        if (isLocked) {
            Tone.context.resume();
            Tone.Transport.start();
            ambienceSynth.current?.start();
            // Ramp volumes up
            padSynth.current?.volume.rampTo(-15, 2);
            bassSynth.current?.volume.rampTo(-10, 2);
            arpSynth.current?.volume.rampTo(-18, 3);
        } else {
            // Ramp volumes down and pause
            padSynth.current?.volume.rampTo(-60, 1);
            bassSynth.current?.volume.rampTo(-60, 1);
            arpSynth.current?.volume.rampTo(-60, 1);
            
            if (coreSignal.current) {
                coreSynth.current?.triggerRelease();
                coreSignal.current = false;
            }

            setTimeout(() => {
                if (!isLocked) {
                    Tone.Transport.stop();
                    ambienceSynth.current?.stop();
                }
            }, 1000);
        }
    }, [isLocked]);

    // --- CORE REACTIVITY ---
    useEffect(() => {
        if (!isSetup.current || !coreSynth.current || !coreDrive.current) return;

        if (gazePressure > 0.05) {
            if (!coreSignal.current) {
                coreSynth.current.triggerAttack("C1");
                coreSignal.current = true;
            }

            // Gaze modulates the "Growl"
            // Higher pressure = harsher metallic sound (FM index) + louder
            const modIndex = 5 + (gazePressure * 20);
            const harmonicity = 1 + (gazePressure * 0.5);
            const volume = -30 + (gazePressure * 25);
            
            coreSynth.current.modulationIndex.rampTo(modIndex, 0.1);
            coreSynth.current.harmonicity.rampTo(harmonicity, 0.1);
            coreSynth.current.volume.rampTo(volume, 0.1);

            // Subtle pitch up
            coreSynth.current.frequency.rampTo(30 + gazePressure * 10, 0.1);

        } else if (coreSignal.current) {
            coreSynth.current.triggerRelease();
            coreSignal.current = false;
        }
    }, [gazePressure]);

    return null;
};

export default AudioManager;
