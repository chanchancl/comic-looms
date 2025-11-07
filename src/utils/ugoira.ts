type Frame = {
  name: string,
  delay: number
  mimeType: string,
  data: Uint8Array,
};

type UgoiraData = {
  img: HTMLImageElement,
  delay: number
}

export class HTMLUgoiraElement extends HTMLElement {

  private _shadow: ShadowRoot;
  private canvas: HTMLCanvasElement;
  private resizeObserver: ResizeObserver | null = null;
  private player: UgoiraPlayer;
  private _frames?: Frame[];
  private connected: boolean = false;

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this.canvas = document.createElement('canvas');
    this.player = new UgoiraPlayer();
    this.initShadowDOM();
  }

  set frames(fs: Frame[] | undefined) {
    this._frames = fs;
    if (this._frames) {
      this.player.mount(this.canvas, this._frames);
    } else {
      this.player.unmount();
    }
    if (this.connected) this.play();
  }

  get frames(): Frame[] | undefined {
    return this._frames;
  }

  connectedCallback(): void {
    // console.log("ugoira-element connected ----------");
    this.connected = true;
    this.setupResizeObserver();
    if (this._frames) this.play();
  }

  disconnectedCallback(): void {
    // console.log("ugoira-element disconnected xxxxxxxxx");
    this.pause();
    this.connected = false;
    // this.frames = undefined;
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => this.updateCanvasSize());
    const parent: HTMLElement | null = this.parentElement;
    if (parent) {
      this.resizeObserver.observe(parent);
    }
  }

  private updateCanvasSize(): void {
    const parent: HTMLElement | null = this.parentElement;
    if (!parent) return;

    // const rect: DOMRect = parent.getBoundingClientRect();
    // console.log("updateCanvasSize", rect);
    this.player.frame0WHPromise.then(wh => {
      this.canvas.width = wh.width;
      this.canvas.height = wh.height;
    });
    // this.player.updateSize(this.canvas);

    // // 保持图片比例（假设所有帧大小相同）
    // if (this._frames && this._frames.length > 0 && this._frames[0] instanceof HTMLImageElement) {
    //   const img: HTMLImageElement = this._frames[0] as HTMLImageElement;
    //   const scaleX: number = rect.width / img.naturalWidth;
    //   const scaleY: number = rect.height / img.naturalHeight;
    //   const scale: number = Math.min(scaleX, scaleY);
    //   this.drawScale = scale;
    //   this.drawOffsetX = (rect.width - img.naturalWidth * scale) / 2;
    //   this.drawOffsetY = (rect.height - img.naturalHeight * scale) / 2;
    // }
  }

  public play(): void {
    this.player.play();
  }
  public pause(): void {
    this.player.pause();
  }

  private initShadowDOM(): void {
    const style: HTMLStyleElement = document.createElement('style');
    style.textContent = `
            canvas {
                display: block;
                width: 100%;
                height: 100%;
            }
        `;
    this._shadow.appendChild(style);
    this._shadow.appendChild(this.canvas);
  }
}

type WH = {
  width: number,
  height: number,
}

export class UgoiraPlayer {

  ctx?: CanvasRenderingContext2D;
  data: UgoiraData[] = [];
  paused: boolean = true;
  index: number = 0;
  wh?: { width: number, height: number };
  animationFrameID?: number;
  frame0WHPromise: Promise<WH>;
  frame0WHResolvce: (value: WH | PromiseLike<WH>) => void;

  constructor() {
    let tResolve: (value: WH | PromiseLike<WH>) => void | undefined;
    this.frame0WHPromise = new Promise<WH>((resolve, _reject) => tResolve = resolve);
    this.frame0WHResolvce = tResolve!;
  }

  mount(canvas: HTMLCanvasElement, frames: Frame[]) {
    // init images
    const data = [];
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const b = new Blob([frame.data as BlobPart], { type: frame.mimeType });
      const src = URL.createObjectURL(b);
      const img = new Image();
      img.addEventListener("load", () => {
        URL.revokeObjectURL(src);
      });
      if (i == 0) {
        img.addEventListener("load", () => {
          this.wh = { width: img.naturalWidth, height: img.naturalHeight };
          this.frame0WHResolvce(this.wh);
        })
      }
      img.src = src;
      data.push({ img, delay: frame.delay });
    }
    this.ctx = canvas.getContext("2d")!;
    this.data = data;
    // this.updateSize(canvas);
  }

  // updateSize(canvas: HTMLCanvasElement) {
  //   this.wh = { width: canvas.width, height: canvas.height };
  // }

  unmount() {
    this.ctx = undefined;
    this.data = [];
    this.paused = true;
    this.index = 0;
  }

  play() {
    if (!this.paused) return;
    this.paused = false;
    this.frame0WHPromise.then(() => {
      if (this.animationFrameID) {
        window.cancelAnimationFrame(this.animationFrameID);
        this.animationFrameID = undefined;
      }
      const animate = this.createAnimate();
      this.animationFrameID = window.requestAnimationFrame(animate);
    });
  }

  pause() {
    this.paused = true
    if (this.animationFrameID) {
      window.cancelAnimationFrame(this.animationFrameID);
      this.animationFrameID = undefined;
    }
  }

  createAnimate() {
    let start: number | undefined;
    const animate = (timestamp: number) => {
      if (start === undefined) start = timestamp;
      const frame = this.data[this.index];
      const elapsed = timestamp - start;

      if (elapsed >= frame.delay) {
        this.index++;
        start = timestamp;
        if (this.index >= this.data.length) {
          this.index = 0;
        }
        this.ctx!.clearRect(0, 0, this.wh?.width ?? 100, this.wh?.height ?? 100);
        this.ctx!.drawImage(frame.img, 0, 0);
      }
      if (!this.paused) {
        this.animationFrameID = window.requestAnimationFrame(animate)
      }
    }
    return animate;
  }
}
