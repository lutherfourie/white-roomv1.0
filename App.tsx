
import React, { useState, useCallback, useEffect } from 'react';
import World from './components/World';
import Interface from './components/Interface';
import AudioManager from './components/AudioManager';
import { PortalConfig } from './types';

// Speech Recognition Type Shim
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

function App() {
    const [isLocked, setIsLocked] = useState(false);
    const [gazePressure, setGazePressure] = useState(0);
    
    // Voice & Portal State
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState("");
    const [portalConfig, setPortalConfig] = useState<PortalConfig>({
        isOpen: true,        // Open by default for visualization
        color: '#00ffff',    // Default Cyan/White to match room
        description: 'System Ready'
    });

    const [recognition, setRecognition] = useState<any>(null);

    useEffect(() => {
        if (SpeechRecognition) {
            const recog = new SpeechRecognition();
            recog.continuous = true;
            recog.interimResults = true;
            recog.lang = 'en-US';
            
            recog.onresult = (event: any) => {
                let currentTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    currentTranscript += event.results[i][0].transcript;
                }
                setTranscript(currentTranscript);
            };

            recog.onerror = (e: any) => {
                // Prevent printing [object Object] to console
                console.warn("Speech Recognition Error:", e.error);
            };

            setRecognition(recog);
        } else {
            console.warn("Speech Recognition API not supported in this browser.");
        }
    }, []);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!isLocked) return;
        if (e.code === 'KeyV' && !isListening && recognition) {
            setIsListening(true);
            setTranscript("");
            setPortalConfig(prev => ({ ...prev, isOpen: false })); // Reset portal on new speech
            try {
                recognition.start();
            } catch(err) {
                console.warn("Recognition already started or failed", err);
            }
        }
    }, [isLocked, isListening, recognition]);

    const handleKeyUp = useCallback((e: KeyboardEvent) => {
        if (e.code === 'KeyV' && isListening && recognition) {
            setIsListening(false);
            try {
                recognition.stop();
            } catch(err) {
                console.warn("Recognition already stopped", err);
            }
            if (transcript.trim().length > 0) {
                activatePortal(transcript);
            }
        }
    }, [isListening, recognition, transcript]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [handleKeyDown, handleKeyUp]);

    // Simple hash to generate a color from text description
    const activatePortal = (desc: string) => {
        let hash = 0;
        for (let i = 0; i < desc.length; i++) {
            hash = desc.charCodeAt(i) + ((hash << 5) - hash);
        }
        const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
        const hex = "#" + "00000".substring(0, 6 - c.length) + c;
        
        setPortalConfig({
            isOpen: true,
            color: hex,
            description: desc
        });
    };

    const handleLockChange = useCallback((locked: boolean) => {
        setIsLocked(locked);
    }, []);

    const handleGazeChange = useCallback((pressure: number) => {
        setGazePressure(pressure);
    }, []);

    return (
        <div className="w-full h-screen relative font-mono text-white bg-black">
            <World 
                isLocked={isLocked}
                portalConfig={portalConfig}
                onLockChange={handleLockChange} 
                onGazeChange={handleGazeChange}
            />
            <Interface 
                isLocked={isLocked}
                gazePressure={gazePressure}
                isListening={isListening}
                transcript={transcript}
            />
            <AudioManager 
                isLocked={isLocked}
                gazePressure={gazePressure}
                portalOpen={portalConfig.isOpen}
            />
        </div>
    );
}

export default App;
