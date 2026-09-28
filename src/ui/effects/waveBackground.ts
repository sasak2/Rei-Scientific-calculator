/**
 * 배경 장식: 오실로스코프 격자 + 흐르는 사인파 + 떠오르는 입자.
 * (아다치 레이의 목소리는 사인파 합성이라는 설정에서 가져온 모티프)
 *
 * 키를 누르면 pulse()로 진폭을 순간적으로 키우고, 지수 감쇠로 되돌린다:
 *   energy ← energy · e^(-dt/τ)   (τ ≈ 0.35s, RC 회로의 방전 곡선과 같은 모양)
 */
interface Particle {
  x: number;
  y: number;
  vy: number;
  r: number;
  a: number;
}

const WAVES = [
  { freq: 1.6, speed: 0.35, amp: 0.035, alpha: 0.35, y: 0.3 },
  { freq: 2.7, speed: -0.22, amp: 0.022, alpha: 0.22, y: 0.34 },
  { freq: 0.9, speed: 0.15, amp: 0.05, alpha: 0.14, y: 0.58 },
];

export class WaveBackground {
  private readonly ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private energy = 0;
  private t = 0;
  private last = performance.now();
  private w = 0;
  private h = 0;
  private color = '#ff7100';
  private raf = 0;
  enabled = true;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.color = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || this.color;
    this.raf = requestAnimationFrame(this.frame);
  }

  pulse(strength = 1): void {
    this.energy = Math.min(1.5, this.energy + strength);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.canvas.hidden = !on;
    cancelAnimationFrame(this.raf);
    if (on) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio, 1.5);
    this.w = this.canvas.clientWidth || window.innerWidth;
    this.h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round((this.w * this.h) / 18000);
    this.particles = Array.from({ length: n }, () => this.spawn(Math.random() * this.h));
  }

  private spawn(y: number): Particle {
    return { x: Math.random() * this.w, y, vy: 6 + Math.random() * 14, r: 0.6 + Math.random() * 1.4, a: 0.1 + Math.random() * 0.35 };
  }

  private frame = (now: number): void => {
    if (!this.enabled) return;
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    this.t += dt;
    this.energy *= Math.exp(-dt / 0.35);
    this.draw(dt);
    this.raf = requestAnimationFrame(this.frame);
  };

  private draw(dt: number): void {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);

    // 오실로스코프 격자 (division 간격 40px)
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = (w % 40) / 2; x < w; x += 40) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, h);
    }
    for (let y = (h % 40) / 2; y < h; y += 40) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
    }
    ctx.stroke();

    // 사인파
    ctx.strokeStyle = this.color;
    ctx.shadowColor = this.color;
    for (const wv of WAVES) {
      const amp = wv.amp * h * (1 + this.energy * 1.8);
      ctx.globalAlpha = Math.min(1, wv.alpha * (1 + this.energy));
      ctx.lineWidth = 1.4;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      const k = (wv.freq * 2 * Math.PI) / w;
      const phase = this.t * wv.speed * 2 * Math.PI;
      for (let x = 0; x <= w; x += 4) {
        const y = wv.y * h + Math.sin(k * x + phase) * amp;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // 입자
    ctx.fillStyle = this.color;
    for (const p of this.particles) {
      p.y -= p.vy * dt * (1 + this.energy);
      if (p.y < -4) Object.assign(p, this.spawn(h + 4));
      ctx.globalAlpha = p.a;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
