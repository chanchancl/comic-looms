import { GalleryMeta } from "../../download/gallery-meta";
import { IMGFetcher } from "../../img-fetcher";
import ImageNode from "../../img-node";
import { Chapter } from "../../page-fetcher";
import { evLog } from "../../utils/ev-log";
import { ADAPTER } from "../adapt";
import { BaseMatcher, OriginMeta, Result } from "../platform";

class BatotoMatcher extends BaseMatcher<string> {

  meta?: GalleryMeta;
  preferServer: { server: string, done: number }[] = [];

  constructor() {
    super();
    const ls = window.localStorage.getItem("prefer-services");
    this.preferServer = ls ? JSON.parse(ls) : [];
  }

  galleryMeta(): GalleryMeta {
    if (this.meta) return this.meta;
    const meta = new GalleryMeta(window.location.href, "");
    const raw = document.querySelector("astro-island[component-url^='/_astro/Display_EmotionChart'][props]")?.getAttribute("props");
    if (raw) {
      const data = JSON.parse(raw)?.data?.[1];
      if (data?.name) {
        meta.title = data.name[1];
        try {
          ["artists", "authors", "genres", "altNames"].forEach(cat => {
            const d = JSON.parse(data[cat][1]) as [number, string][];
            const values = d.map(v => v[1]);
            meta.tags[cat] = values;
            if (cat === "altNames") {
              meta.originTitle = values[values.length - 1];
            }
          })
        } catch (err) {
          evLog("error", "parse gallery info error", err);
        }
      }
    }
    this.meta = meta;
    return this.meta;
  }

  async *fetchChapters(): AsyncGenerator<Chapter[]> {
    let elements = Array.from(document.querySelectorAll<HTMLDivElement>("div[name=chapter-list] .scrollable-panel .flex-col-reverse astro-slot > div"));
    elements = elements.reverse();
    if (elements.length === 0) {
      elements = Array.from(document.querySelectorAll<HTMLDivElement>("div[name=chapter-list] .scrollable-panel .flex-col astro-slot > div"));
    }
    return elements.map((elem, i) => {
      const a = elem.querySelector<HTMLAnchorElement>("div:first-child > a");
      if (!a) throw new Error("cannot find chapter element");
      return new Chapter(i, a.textContent!, a.href);
    });
  }

  async *fetchPagesSource(chapter: Chapter): AsyncGenerator<Result<string>> {
    const url = new URL(chapter.source);
    url.searchParams.set("load", "2");
    yield Result.ok(url.href);
  }

  async parseImgNodes(href: string): Promise<ImageNode[]> {
    const doc = await window.fetch(href).then(resp => resp.text()).then(text => new DOMParser().parseFromString(text, "text/html")).catch(Error);
    if (doc instanceof Error) throw doc;
    const raw = doc.querySelector("astro-island[component-url^='/_astro/ImageList'][props]")?.getAttribute("props");
    if (!raw) throw new Error("cannot find ImageList props");
    const json1 = JSON.parse(raw);
    if (!json1.imageFiles?.[1]) throw new Error("cannot find imageFiles from ImageList props");
    const images = JSON.parse(json1.imageFiles[1]) as [number, string][];
    if (!images.length || images.length === 0) throw new Error("cannot find images");
    const digits = images.length.toString().length;
    return images.map(([_, url], i) => {
      const title = (i + 1).toString().padStart(digits, "0");
      const ext = url.split(".").pop() ?? "webp";
      let wh = undefined;
      const matches = url.match(/\/\d+_(\d+)_(\d+)_\d+\.\w+$/);
      if (matches && matches.length === 3) {
        wh = { w: parseInt(matches[1]), h: parseInt(matches[2]) };
      }
      return new ImageNode("", href, `${title}.${ext}`, undefined, url, wh);
    })
  }

  async fetchOriginMeta(node: ImageNode): Promise<OriginMeta> {
    return { url: node.originSrc! };
  }

  async fetchImageData(imf: IMGFetcher): Promise<Blob | null> {
    let ret = await super.fetchImageData(imf).catch(Error);
    const url = new URL(imf.node.originSrc!);
    if (ret === null || ret instanceof Error || ret?.type.startsWith("text")) { // server down
      this.updatePerferServer(url.host, true);
      evLog("info", "server down, try other servers", this.preferServer);
      for (const server of this.preferServer) {
        url.host = server.server;
        imf.node.originSrc = url.href;
        ret = await super.fetchImageData(imf);
        if (ret?.type.startsWith("image")) {
          break;
        };
        this.updatePerferServer(url.host, true);
      }
    }
    if (ret instanceof Error) throw ret;
    if (ret?.type.startsWith("image")) {
      this.updatePerferServer(url.host);
    }
    return ret;
  }

  updatePerferServer(server: string, failed?: boolean) {
    const found = this.preferServer.findIndex(v => v.server === server);
    let changed = false;
    if (found > -1) {
      this.preferServer[found].done = Math.min(20, (this.preferServer[found].done + (failed ? -1 : 1)));
      changed = true;
    } else if (!failed) {
      this.preferServer.push({ server: server, done: 1 });
      changed = true;
    }
    if (changed) {
      this.preferServer = this.preferServer.sort((a, b) => {
        if (a.done === b.done) return Math.random() - 0.5;
        return b.done - a.done;
      });
      this.preferServer = this.preferServer.slice(0, 30);
      window.localStorage.setItem("prefer-services", JSON.stringify(this.preferServer));
    }
  }

}
ADAPTER.addSetup({
  name: "BATO.TO v3x",
  workURLs: [
    /(mangatoto.com|bato.to)\/title\/\d+[^\/]*$/
  ],
  match: ["https://mangatoto.com/*", "https://bato.to/*"],
  constructor: () => new BatotoMatcher(),
});
