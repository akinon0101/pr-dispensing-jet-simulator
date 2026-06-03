import React, { useState, useEffect, useRef } from 'react';

// 1종 0차 변형 베셀 함수 I_0(x) 테일러 급수 구현
function besselI0(x: number): number {
  const x2 = x * x;
  return 1 + x2 / 4 + Math.pow(x2, 2) / 64 + Math.pow(x2, 3) / 2304 + Math.pow(x2, 4) / 147456;
}

// 1종 1차 변형 베셀 함수 I_1(x) 테일러 급수 구현
function besselI1(x: number): number {
  const x2 = x * x;
  return x / 2 + Math.pow(x, 3) / 16 + Math.pow(x, 5) / 384 + Math.pow(x, 7) / 18432;
}

interface EngineInput {
  r0: number; rho: number; gamma: number; eta0: number; U: number; E: number; L: number;
}

interface EngineOutput {
  tFlight: number; finalViscosity: number; kMax: number; omegaMax: number; tBreakup: number; isDefectRisk: boolean;
}

function calculateWeberStability(inputs: EngineInput): EngineOutput {
  let { r0, rho, gamma, eta0, U, E, L } = inputs;

  // 분모 0 방지 및 수치적 극한 처리를 위한 무한소 안전 장치
  if (r0 <= 0) r0 = 1e-9; 
  if (L <= 0) L = 1e-9;   

  const tFlight = U > 0 ? L / U : 0;
  // 수정된 직관적 점도 식 반영: η(t) = η0 * e^(E * t)
  const finalViscosity = eta0 * Math.exp(E * tFlight);

  let omegaMax = 0;
  let kMax = 0;
  const kEnd = 1.0 / r0;
  const steps = 150;

  for (let i = 1; i < steps; i++) {
    const k = (kEnd / steps) * i;
    const kr0 = k * r0;
    if (kr0 >= 1.0) continue;

    const besselRatio = besselI0(kr0) !== 0 ? besselI1(kr0) / besselI0(kr0) : 0;
    const drivingForce = (gamma / (rho * Math.pow(r0, 3))) * kr0 * besselRatio * (1 - kr0 * kr0);
    const viscousDamping = (3 * finalViscosity * k * k) / (2 * rho);

    const sqrtTerm = viscousDamping * viscousDamping + drivingForce;
    if (sqrtTerm < 0) continue;

    const omega = -viscousDamping + Math.sqrt(sqrtTerm);
    if (omega > omegaMax) {
      omegaMax = omega;
      kMax = k;
    }
  }

  const tBreakup = omegaMax > 0 ? Math.log(r0 / (r0 * 0.001)) / omegaMax : Infinity;
  const isDefectRisk = tBreakup < tFlight;

  return { tFlight, finalViscosity, kMax, omegaMax, tBreakup, isDefectRisk };
}

const BesselCalculatorSimulator: React.FC = () => {
  const [r0, setR0] = useState<number>(200);     // μm
  const [U, setU] = useState<number>(1.5);       // m/s
  const [eta0, setEta0] = useState<number>(5.0);   // cP
  const [gamma, setGamma] = useState<number>(30);  // mN/m
  const [E, setE] = useState<number>(2.0);       // 1/s (직관적인 스케일 조정을 위해 초기값 변경)
  const [L, setL] = useState<number>(30);        // mm

  const [result, setResult] = useState<EngineOutput | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const out = calculateWeberStability({
      r0: r0 * 1e-6, rho: 1000, gamma: gamma * 1e-3, eta0: eta0 * 1e-3, U, E, L: L * 1e-3
    });
    setResult(out);
  }, [r0, U, eta0, gamma, E, L]);

  // 실시간 애니메이션 루프
  useEffect(() => {
    if (!result || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let timePhase = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      timePhase += 0.05;

      const midY = canvas.height / 2;
      const width = canvas.width;
      const k = result.kMax > 0 ? result.kMax * 1e-4 : 0.05; 
      const amplitudeFactor = result.isDefectRisk ? 12 : 3;

      ctx.beginPath();
      ctx.fillStyle = '#4299E1';
      
      const baseRadiusPx = Math.max(2, (r0 / 500) * 40); 

      for (let x = 0; x <= width; x++) {
        const wave = Math.cos(x * k - timePhase) * (amplitudeFactor * (baseRadiusPx / 25));
        const radius = baseRadiusPx + wave;
        const currentRadius = (result.isDefectRisk && radius < (baseRadiusPx * 0.5)) || r0 === 0 ? 0 : radius;

        if (x === 0) ctx.moveTo(x, midY - currentRadius);
        else ctx.lineTo(x, midY - currentRadius);
      }

      for (let x = width; x >= 0; x--) {
        const wave = Math.cos(x * k - timePhase) * (amplitudeFactor * (baseRadiusPx / 25));
        const radius = baseRadiusPx + wave;
        const currentRadius = (result.isDefectRisk && radius < (baseRadiusPx * 0.5)) || r0 === 0 ? 0 : radius;

        ctx.lineTo(x, midY + currentRadius);
      }

      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#4A5568';
      const nozzleHeight = Math.max(10, baseRadiusPx * 2.5);
      ctx.fillRect(0, midY - nozzleHeight / 2, 15, nozzleHeight);

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [result, r0]);

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '25px', fontFamily: 'sans-serif', background: '#fff', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.08)' }}>
      <header style={{ borderBottom: '2px solid #4A5568', paddingBottom: '12px', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, color: '#2D3748' }}>PR Dispensing Jet 계산 시뮬레이터</h2>
        <p style={{ margin: '5px 0 0 0', color: '#718096', fontSize: '0.85rem' }}>Rayleigh-Plateau 액주 분열 식 & 비행 기화 모델 기반 수치 해석기</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '25px', marginBottom: '25px' }}>
        <div style={{ background: '#F7FAFC', padding: '20px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
          <h4 style={{ margin: '0 0 15px 0', color: '#4A5568', borderBottom: '1px solid #E2E8F0', paddingBottom: '6px' }}>공정 변수 미세 제어 (Inputs)</h4>
          
          <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 'bold' }}>
              <span>노즐 반경 (r₀)</span>
              <span style={{ color: '#2B6CB0' }}>{r0 === 0 ? "0.0 (Extreme)" : `${r0.toFixed(1)} μm`}</span>
            </div>
            <input type="range" min="0" max="500" step="1" value={r0} onChange={(e) => setR0(Number(e.target.value))} style={{ width: '100%', cursor: 'pointer' }} />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 'bold' }}>
              <span>토출 속도 (U)</span>
              <span style={{ color: '#2B6CB0' }}>{U.toFixed(2)} m/s</span>
            </div>
            <input type="range" min="0.2" max="4.0" step="0.01" value={U} onChange={(e) => setU(Number(e.target.value))} style={{ width: '100%', cursor: 'pointer' }} />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 'bold' }}>
              <span>초기 PR 점도 (η₀)</span>
              <span style={{ color: '#2B6CB0' }}>{eta0.toFixed(2)} cP</span>
            </div>
            <input type="range" min="1.0" max="25.0" step="0.05" value={eta0} onChange={(e) => setEta0(Number(e.target.value))} style={{ width: '100%', cursor: 'pointer' }} />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 'bold' }}>
              <span>표면장력 (γ)</span>
              <span style={{ color: '#2B6CB0' }}>{gamma.toFixed(1)} mN/m</span>
            </div>
            <input type="range" min="15" max="50" step="0.1" value={gamma} onChange={(e) => setGamma(Number(e.target.value))} style={{ width: '100%', cursor: 'pointer' }} />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 'bold' }}>
              <span>용매 증발 계수 (E)</span>
              <span style={{ color: '#2B6CB0' }}>{E.toFixed(2)} 1/s</span>
            </div>
            <input type="range" min="0.0" max="10.0" step="0.1" value={E} onChange={(e) => setE(Number(e.target.value))} style={{ width: '100%', cursor: 'pointer' }} />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 'bold' }}>
              <span>노즐-웨이퍼 거리 (L)</span>
              <span style={{ color: '#2B6CB0' }}>{L === 0 ? "0.0 (Contact)" : `${L.toFixed(1)} mm`}</span>
            </div>
            <input type="range" min="0" max="60" step="0.5" value={L} onChange={(e) => setL(Number(e.target.value))} style={{ width: '100%', cursor: 'pointer' }} />
          </div>
        </div>

        <div style={{ background: '#FFF', border: '1px solid #E2E8F0', padding: '20px', borderRadius: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h4 style={{ margin: '0 0 15px 0', color: '#2B6CB0', borderBottom: '1px solid #E2E8F0', paddingBottom: '6px' }}>연산 결과 (Outputs)</h4>
            {result && (
              <div style={{ fontSize: '0.9rem', lineHeight: '1.8' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #EDF2F7', padding: '6px 0' }}>
                  <span style={{ color: '#4A5568' }}>비행 시간 (t_flight):</span>
                  <strong>{(result.tFlight * 1000).toFixed(2)} ms</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #EDF2F7', padding: '6px 0' }}>
                  <span style={{ color: '#4A5568' }}>비행 후 점도 (η):</span>
                  <strong>{(result.finalViscosity * 1000).toFixed(2)} cP</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #EDF2F7', padding: '6px 0' }}>
                  <span style={{ color: '#4A5568' }}>최적 파수 (k_max):</span>
                  <strong>{result.kMax.toFixed(1)} m⁻¹</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #EDF2F7', padding: '6px 0' }}>
                  <span style={{ color: '#4A5568' }}>최대 성장률 (ω_max):</span>
                  <strong>{result.omegaMax.toFixed(2)} s⁻¹</strong>
                </div>
                
                <div style={{ marginTop: '20px', padding: '12px', background: '#EBF8FF', borderRadius: '6px', textAlign: 'center', border: '1px solid #BEE3F8' }}>
                  <span style={{ fontSize: '0.8rem', color: '#2B6CB0', display: 'block', fontWeight: 'bold' }}>예측된 액주 분열 시간 (t_breakup)</span>
                  <strong style={{ fontSize: '1.4rem', color: '#2B6CB0' }}>{(result.tBreakup * 1000).toFixed(2)} ms</strong>
                </div>
              </div>
            )}
          </div>

          {result && (
            <div style={{
              marginTop: '20px', padding: '14px', borderRadius: '6px', color: '#fff',
              backgroundColor: result.isDefectRisk ? '#E53E3E' : '#38A169',
              fontWeight: 'bold', textAlign: 'center', fontSize: '0.9rem', boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
            }}>
              {result.isDefectRisk ? "⚠️ 위험: 비산 결함 발생 (조기 분열)" : "✅ 안정: 균일한 액주 코팅 형성"}
            </div>
          )}
        </div>
      </div>

      <div style={{ border: '1px solid #CBD5E0', borderRadius: '8px', overflow: 'hidden', background: '#F7FAFC', boxShadow: '0 2px 5px rgba(0,0,0,0.02)' }}>
        <div style={{ padding: '10px 15px', background: '#EDF2F7', borderBottom: '1px solid #CBD5E0', fontSize: '0.8rem', fontWeight: 'bold', color: '#4A5568' }}>
          실시간 액주 계면 파동 전단 프로파일 (Rayleigh-Plateau Instability Dynamic View)
        </div>
        <div style={{ padding: '20px', display: 'flex', justifyContent: 'center', background: '#fff' }}>
          <canvas ref={canvasRef} width="830" height="130" style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '6px' }} />
        </div>
      </div>
    </div>
  );
};

export default BesselCalculatorSimulator;


// npm run dev