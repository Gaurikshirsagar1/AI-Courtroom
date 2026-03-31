import React, { useState, useEffect, useRef } from 'react';
import { Gavel, User, Scale, Shield, Users, FileText } from 'lucide-react';

const PHASES = [
  "Judge Opens",
  "Pros. Opening",
  "Def. Opening",
  "Testimony",
  "Cross-Ex I",
  "Redirect",
  "Cross-Ex II",
  "Pros. Closing",
  "Def. Closing",
  "Deliberation",
  "Verdict"
];

const AGENT_CONFIGS = {
  Judge: {
    icon: Gavel,
    role: "Judge",
    api: "gemini",
    model: "gemini-2.5-flash",
    systemPrompt: "You are the presiding Judge in a virtual courtroom simulation. You are formal, highly authoritative, and control the flow of the trial. Speak with gravitas, using realistic legal terminology. Keep your response extremely brief (maximum 2-3 sentences). You are initializing the trial or delivering the final verdict."
  },
  Witness: {
    icon: User,
    role: "Witness",
    api: "ollama",
    model: "llama3",
    systemPrompt: "You are an anxious witness in a court trial. You are specific about details but you must ALWAYS hide exactly one clear inconsistency or contradiction in your statement that the prosecution can exploit later. Speak naturally as a nervous individual. Keep your response extremely brief (maximum 2-3 sentences)."
  },
  Prosecutor: {
    icon: Scale,
    role: "Prosecutor",
    api: "gemini",
    model: "gemini-2.5-flash",
    systemPrompt: "You are an aggressive, strategic prosecutor. You attack inconsistencies relentlessly. Use the preceding witness statement as evidence to tear down their credibility and prove guilt. Be sharp, calculating, and ruthless. Keep your response extremely brief (maximum 2-3 sentences)."
  },
  Defense: {
    icon: Shield,
    role: "Defense",
    api: "ollama",
    model: "phi3",
    systemPrompt: "You are an empathetic but razor-sharp defense attorney. You exploit the prosecution's overreach and provide alternative, reasonable explanations for the witness's actions. Protect your client. Be compelling and intelligent. Keep your response extremely brief (maximum 2-3 sentences)."
  },
  Jury: {
    icon: Users,
    role: "Jury",
    api: "mix",
    systemPrompt: "You are the Jury of a virtual courtroom simulation. Analyze the transcript logically as a collective. Present your deliberation clearly, evaluating the arguments. Keep your response extremely brief (maximum 2-3 sentences)."
  },
  Clerk: {
    icon: FileText,
    role: "Clerk",
    api: "gemini",
    model: "gemini-2.5-flash",
    systemPrompt: "You are the neutral Court Clerk. Your job is to strictly summarize the trial transcript into a highly compressed, objective format. Capture all key arguments and contradictions so that nothing is missed. Do not add commentary."
  }
};

const BIAS_PROMPTS = {
  "Neutral": "You are fully objective and fair. Weigh the evidence evenly.",
  "Pro-Prosecution": "You secretly lean guilty.Frame all ambiguity as evidence of guilt. Be deeply suspicious of the defense.",
  "Pro-Defense": "You give heavy benefit of the doubt to the defense. Find flaws in the prosecution's aggressive tactics.",
  "Chaos Mode": "You are a divided, unpredictable jury: act as three differing voices (one highly logical, one deeply emotional, one conspiracy theorist). Argue with yourselves before concluding."
};

const SAMPLE_CASES = [
  "Corporate Embezzlement at a Fortune 500 Tech Company.",
  "Medical Malpractice resulting in permanent injury.",
  "Intellectual Property Theft involving a revolutionary AI algorithm.",
  "A high-profile defamation lawsuit between two rival celebrities.",
  "First-degree murder trial involving a wealthy heir and a missing will.",
  "Environmental negligence by a chemical plant poisoning a local river.",
  "Insider trading conspiracy at a major Wall Street investment bank.",
  "Arson at a historical downtown landmark with a massive insurance payout."
];

export default function App() {
  const [phase, setPhase] = useState(0); // 0 = Landing, 1-11 = Trial phases
  const [caseDesc, setCaseDesc] = useState("");
  const [biasMode, setBiasMode] = useState("Neutral");
  const [transcript, setTranscript] = useState([]);
  const [runningSummary, setRunningSummary] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  // New V2 states
  const [playerRole, setPlayerRole] = useState("None");
  const [enableObjections, setEnableObjections] = useState(true);
  const [isPlayerTurn, setIsPlayerTurn] = useState(false);
  const [playerInput, setPlayerInput] = useState("");

  const AGENT_SEQUENCE = {
    1: "Judge", 2: "Prosecutor", 3: "Defense", 4: "Witness", 
    5: "Prosecutor", 6: "Defense", 7: "Prosecutor", 8: "Prosecutor", 
    9: "Defense", 10: "Jury", 11: "Judge"
  };

  const transcriptRef = useRef(null);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript, isLoading]);

  const startTrial = async () => {
    if (!caseDesc.trim()) return;
    setPhase(1);
    setTranscript([]);
    await runPhase(1, []);
  };

  const fetchOpenRouter = async (model, systemContext, historyPrompt) => {
    const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("VITE_OPENROUTER_API_KEY is missing in .env");

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": window.location.href,
        "X-Title": "Zero-Gravity Tribunal",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemContext },
          { role: "user", content: historyPrompt }
        ],
        max_tokens: 2048
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.choices[0].message.content;
  };

  const fetchOllama = async (model, systemContext, historyPrompt) => {
    try {
      const response = await fetch("http://localhost:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemContext },
            { role: "user", content: historyPrompt }
          ],
          stream: false
        })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      return data.message.content;
    } catch (e) {
      throw new Error(`Ollama Connection Failed: Please ensure 'ollama serve' or 'ollama run ${model}' is active. (${e.message})`);
    }
  };

  const fetchGemini = async (systemContext, historyPrompt) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error("VITE_GEMINI_API_KEY is missing in .env");

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `SYSTEM DIRECTIVE: ${systemContext}\n\n${historyPrompt}` }] }],
        generationConfig: { maxOutputTokens: 2048 }
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.candidates[0].content.parts[0].text;
  };

  const fetchMistral = async (model, systemContext, historyPrompt) => {
    const apiKey = import.meta.env.VITE_MISTRAL_API_KEY;
    if (!apiKey) throw new Error("VITE_MISTRAL_API_KEY is missing in .env");

    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemContext },
          { role: "user", content: historyPrompt }
        ]
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.choices[0].message.content;
  };


  const processAgentTurn = async (agentName, customAdditionalPrompt, currentTranscript) => {
    setIsLoading(true);
    const config = AGENT_CONFIGS[agentName];

    const systemContext = config.systemPrompt +
      (customAdditionalPrompt ? `\n\n${customAdditionalPrompt}` : "") +
      `\n\nThe case is: "${caseDesc}"`;

    let historyPrompt = "";
    if (currentTranscript.length > 0) {
      if (currentTranscript.length > 3) {
        let recent = currentTranscript.slice(-3).map(t => `[${t.agent}]: ${t.content}`).join("\n\n");
        historyPrompt = `Court Clerk's Summary of earlier events:\n${runningSummary || "(No summary available yet)"}\n\nMost recent 3 statements:\n${recent}\n\nPlease respond as ${agentName}. Only output your spoken words, no roleplay actions or introductory text.`;
      } else {
        let combinedTranscript = currentTranscript.map(t => `[${t.agent}]: ${t.content}`).join("\n\n");
        historyPrompt = `Trial Transcript so far:\n${combinedTranscript}\n\nPlease respond as ${agentName}. Only output your spoken words, no roleplay actions or introductory text.`;
      }
    } else {
      historyPrompt = `Please begin the trial as ${agentName}. Only output your spoken words, no roleplay actions or introductory text.`;
    }

    try {
      let responseText = "";

      if (config.api === "gemini") {
        responseText = await fetchGemini(systemContext, historyPrompt);
      } else if (config.api === "openrouter") {
        responseText = await fetchOpenRouter(config.model, systemContext, historyPrompt);
      } else if (config.api === "ollama") {
        responseText = await fetchOllama(config.model, systemContext, historyPrompt);
      } else if (config.api === "mistral") {
        responseText = await fetchMistral(config.model, systemContext, historyPrompt);
      } else if (config.api === "mix") {
        // Jury Mix: Calls multiple architectures sequentially to represent diverse biases
        const safeFetch = async (promiseFunc) => {
          try { return await promiseFunc(); } catch (e) { return `Error: ${e.message}`; }
        };

        const r1 = await safeFetch(() => fetchOllama("llama3", systemContext, historyPrompt)); // LLaMA
        const r2 = await safeFetch(() => fetchMistral("mistral-small-latest", systemContext, historyPrompt)); // Mistral
        const r3 = await safeFetch(() => fetchOllama("phi3", systemContext, historyPrompt)); // Phi-3

        responseText = "*Jury Subroutine (LLaMA):*\n" + r1 +
          "\n\n*Jury Subroutine (Mistral):*\n" + r2 +
          "\n\n*Jury Subroutine (Phi-3):*\n" + r3;
      }

      const newMessage = { agent: agentName, content: responseText };
      return newMessage;
    } catch (err) {
      return { agent: agentName, content: `[Connection Error: ${err.message}]` };
    } finally {
      setIsLoading(false);
    }
  };

  const runPhase = async (targetPhase, currentHistory) => {
    const expectedAgent = AGENT_SEQUENCE[targetPhase];
    if (playerRole !== "None" && expectedAgent === playerRole) {
       setIsPlayerTurn(true);
       return; // Halt logic to wait for user to submit text
    }

    let newMessage = null;

    switch (targetPhase) {
      case 1:
        newMessage = await processAgentTurn("Judge", "Open the court proceedings. Formally introduce the case.", currentHistory);
        break;
      case 2:
        newMessage = await processAgentTurn("Prosecutor", "Deliver your Opening Statement. Outline the severe charges against the defendant based on the case description.", currentHistory);
        break;
      case 3:
        newMessage = await processAgentTurn("Defense", "Deliver your Opening Statement. Frame the defendant as innocent and cast doubt on the prosecution's claims.", currentHistory);
        break;
      case 4:
        newMessage = await processAgentTurn("Witness", "Give your testimony about the case. Make sure to hide one subtle contradiction or inconsistency in your story.", currentHistory);
        break;
      case 5:
        newMessage = await processAgentTurn("Prosecutor", "Initial cross-examination. Attack the witness's testimony and highlight any inconsistencies.", currentHistory);
        break;
      case 6:
        newMessage = await processAgentTurn("Defense", "Object to the prosecution's tactics. Ask the witness a redirect question to clarify the narrative and save their credibility.", currentHistory);
        break;
      case 7:
        newMessage = await processAgentTurn("Prosecutor", "Final aggressive cross-examination. Press harder on the witness and corner them completely.", currentHistory);
        break;
      case 8:
        newMessage = await processAgentTurn("Prosecutor", "Deliver your Closing Argument. Summarize why the evidence proves guilt beyond a reasonable doubt.", currentHistory);
        break;
      case 9:
        newMessage = await processAgentTurn("Defense", "Deliver your Closing Argument. Summarize why the prosecution failed to prove their case.", currentHistory);
        break;
      case 10:
        newMessage = await processAgentTurn("Jury", BIAS_PROMPTS[biasMode], currentHistory);
        break;
      case 11:
        newMessage = await processAgentTurn("Judge", "Deliver the final binding verdict based on the jury's deliberation and the arguments presented. Explain the reasoning.", currentHistory);
        break;
      default:
        break;
    }

    resumePhaseWithNewMessage(newMessage, currentHistory, targetPhase);
  };

  const handlePlayerSubmit = () => {
    if (!playerInput.trim()) return;
    const expectedAgent = AGENT_SEQUENCE[phase];
    const newMessage = { agent: expectedAgent, content: playerInput };
    setPlayerInput("");
    setIsPlayerTurn(false);
    resumePhaseWithNewMessage(newMessage, transcript, phase);
  };

  const resumePhaseWithNewMessage = async (newMessage, currentHistory, targetPhase) => {
    if (newMessage) {
      let updatedHistory = [...currentHistory, newMessage];
      setTranscript([...updatedHistory]); // initial sync

      // Evaluate Dynamic Objections
      if (enableObjections && ["Cross-Ex I", "Cross-Ex II", "Testimony", "Pros. Opening", "Def. Opening"].includes(PHASES[targetPhase - 1])) {
        let opposing = newMessage.agent === "Prosecutor" ? "Defense" : (newMessage.agent === "Defense" || newMessage.agent === "Witness" ? "Prosecutor" : null);

        if (opposing && playerRole !== opposing) {
          setIsLoading(true);
          const objPrompt = `The ${newMessage.agent} just stated: "${newMessage.content}". Do you object strictly on legal grounds (hearsay, leading, argumentative)? Reply ONLY with "OBJECTION: <reason>" or "NO OBJECTION". Keep it very brief.`;
          try {
             const config = AGENT_CONFIGS[opposing];
             let reply = "";
             if (config.api === "gemini") reply = await fetchGemini(config.systemPrompt, objPrompt);
             else if (config.api === "ollama") reply = await fetchOllama(config.model, config.systemPrompt, objPrompt);
             else if (config.api === "mistral") reply = await fetchMistral(config.model, config.systemPrompt, objPrompt);
             
             if (reply && reply.includes("OBJECTION")) {
                updatedHistory.push({ agent: opposing, content: reply });
                setTranscript([...updatedHistory]);
                
                // Judge Rules
                const judgeConfig = AGENT_CONFIGS.Judge;
                const judgePrompt = `${opposing} objects: "${reply}". Do you sustain or overrule? Reply ONLY with "SUSTAINED" or "OVERRULED" followed by a 1-sentence reason.`;
                const rule = await fetchGemini(judgeConfig.systemPrompt, judgePrompt);
                updatedHistory.push({ agent: "Judge", content: rule });
             }
          } catch(e) { console.error("Objection error", e); }
        }
      }

      setTranscript([...updatedHistory]);
      setIsLoading(false);

      if (updatedHistory.length > 2) {
        const combined = updatedHistory.map(t => `[${t.agent}]: ${t.content}`).join("\n\n");
        const prompt = `Please summarize this courtroom transcript so far so no details are missed:\n\n${combined}`;
        fetchGemini(AGENT_CONFIGS.Clerk.systemPrompt, prompt).then(sum => setRunningSummary(sum)).catch(e => console.error(e));
      }

      if (targetPhase < 11) {
        setPhase(targetPhase + 1);
      } else {
        setPhase(12);
      }
    }
  };

  const resetTrial = () => {
    setPhase(0);
    setTranscript([]);
    setRunningSummary("");
    setCaseDesc("");
    setIsPlayerTurn(false);
    setPlayerInput("");
  };

  if (phase === 0) {
    return (
      <div className="landing-container">
        <div className="landing-card">
          <h1 className="title-glow mono" style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>VIRTUAL COURTROOM</h1>
          <p className="mono" style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>AI-Powered Multi-Agent Simulation</p>

          <textarea
            className="case-input"
            placeholder="Enter case parameters or select an authorized infraction below..."
            value={caseDesc}
            onChange={(e) => setCaseDesc(e.target.value)}
          />

          <div className="examples">
            {SAMPLE_CASES.map((ext, idx) => (
              <button key={idx} className="example-btn" onClick={() => setCaseDesc(ext)}>
                {ext}
              </button>
            ))}
          </div>

          <h3 className="mono" style={{ marginBottom: '1rem', color: 'var(--neon-blue)' }}>GAMEPLAY SETTINGS</h3>
          <div className="bias-selector" style={{ flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <label className="mono" style={{color: 'var(--text-muted)'}}>
              Player Role:
              <select className="pill-btn select-dropdown" value={playerRole} onChange={(e) => setPlayerRole(e.target.value)} style={{marginLeft: '0.5rem', background: 'transparent', color: 'inherit'}}>
                <option value="None">Spectator (AI Only)</option>
                <option value="Prosecutor">Prosecutor</option>
                <option value="Defense">Defense</option>
              </select>
            </label>
            <label className="mono" style={{color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
              <input type="checkbox" checked={enableObjections} onChange={(e) => setEnableObjections(e.target.checked)} />
              Enable Dynamic AI Objections
            </label>
          </div>

          <h3 className="mono" style={{ marginBottom: '1rem', color: 'var(--neon-blue)', marginTop: '1.5rem' }}>JURY COGNITIVE BIAS</h3>
          <div className="bias-selector">
            {Object.keys(BIAS_PROMPTS).map((mode) => (
              <button
                key={mode}
                className={`pill-btn ${biasMode === mode ? 'active' : ''}`}
                onClick={() => setBiasMode(mode)}
              >
                {mode}
              </button>
            ))}
          </div>

          <button
            className="call-to-order-btn"
            onClick={startTrial}
            disabled={!caseDesc.trim()}
          >
            CALL TO ORDER
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="trial-container">
      {/* Stepper */}
      <div className="phase-stepper">
        {PHASES.map((p, idx) => {
          const stepPhase = idx + 1;
          let stepClass = "step";
          if (phase === stepPhase) stepClass += " active";
          if (phase > stepPhase) stepClass += " done";
          return (
            <div key={idx} className={stepClass}>
              <div className="step-dot"></div>
              <div className="step-label">{p}</div>
            </div>
          );
        })}
      </div>

      {/* Transcript */}
      <div className="transcript-view" ref={transcriptRef}>
        {transcript.map((msg, idx) => {
          const config = AGENT_CONFIGS[msg.agent];
          const Icon = config.icon;
          return (
            <div key={idx} className={`message-card agent-${msg.agent}`}>
              <div className="message-header">
                <Icon size={24} />
                <span>{msg.agent.toUpperCase()}</span>
              </div>
              <div className="message-body">
                {msg.content}
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="spinner-container">
            <div className="spinner"></div>
            <div>The tribunal deliberates...</div>
          </div>
        )}
      </div>

      {/* Player Input Container */}
      {isPlayerTurn && !isLoading && (
        <div className="player-input-container" style={{ padding: '2rem', background: 'rgba(0,0,0,0.4)', borderTop: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <textarea 
            className="case-input" 
            placeholder={`Type your argument as ${playerRole}...`}
            value={playerInput}
            onChange={(e) => setPlayerInput(e.target.value)}
            style={{ width: '80%', minHeight: '80px', marginBottom: '1rem' }}
          />
          <button className="call-to-order-btn" style={{ padding: '0.8rem 2rem', fontSize: '1rem' }} onClick={handlePlayerSubmit}>
            SUBMIT ARGUMENT
          </button>
        </div>
      )}

      {/* Footer Controls */}
      {phase > 0 && phase < 12 && !isLoading && !isPlayerTurn && (
        <div className="controls-footer" style={{ borderTop: 'none', padding: '1rem' }}>
          <button className="call-to-order-btn" style={{ padding: '0.8rem 2rem', fontSize: '1rem' }} onClick={() => runPhase(phase, transcript)}>
            CONTINUE TRIAL ({PHASES[phase - 1].toUpperCase()})
          </button>
        </div>
      )}

      {phase === 12 && (
        <div className="controls-footer">
          <button className="call-to-order-btn" style={{ padding: '0.8rem 2rem', fontSize: '1rem' }} onClick={resetTrial}>
            NEW TRIAL
          </button>
        </div>
      )}
    </div>
  );
}
