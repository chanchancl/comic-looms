import { GalleryMeta } from "../download/gallery-meta";
import ImageNode from "../img-node";
import { Chapter } from "../page-fetcher";


export type OriginMeta = {
  url: string,
  title?: string,
  href?: string,
}

export class Result<T> {
  value?: T;
  error?: Error;
  static ok<T>(value: T): Result<T> {
    return {
      value,
    }
  }
  static err<T>(error: Error): Result<T> {
    return {
      error,
    }
  }
};

/** Adaptation for different sites
 *  Includes: how to extract image information from the page, gallery metadata, and process image data.<br>
 *  `<P>`: PageSource, which can be a document object (`Document`), URL (`string`), or JSON Data (`{key:value}`),<br>
 *       depending on what information you want to extract from the page during the `fetchPagesSource(chapter)` stage.<br>
 *       For example:<br>
 *          If you collected all page URLs from the current page, set the generic `<P>` to `<string>`, then use the `yield` keyword to return each page URL. These URLs will be passed as parameters to the next stage `parseImgNodes(pageSource)`.<br>
 *          If you requested gallery data from an API and extracted all image information from it, set the generic `<P>` to `<{url:string,...}[]>`.<br>
 */
export interface Matcher<P> {

  /** STEP 1: Fetch chapter information
   *  Some sites’ galleries have no concept of chapters — this step can be skipped.  
   *  In `BaseMatcher`, `fetchChapters` has a default implementation that returns a single default chapter.  
   *  For other sites with multi-chapter comics, you need to retrieve all chapter information from the page or API in this step.
   */
  fetchChapters(): AsyncGenerator<Chapter[], Chapter[], Chapter[]>;

  /** STEP 2: Fetch the data source for each page
   *  This method returns an async generator. In the UI, when scrolling to the bottom of the thumbnail grid,  
   *  the async generator's `next()` will be called, retrieving the result yielded each time.<br>
   *  @param chapter If the site has no concept of chapters, you can ignore this parameter.  
   *                 Otherwise, you can request the chapter's page document via `chapter.source`:
   *                 ```ts
   *                 const doc = await window.fetch(chapter.source)
   *                   .then(resp => resp.text())
   *                   .then(text => new DOMParser().parseFromString(text, "text/html"))
   *                   .catch(Error);
   *                 ```
   *  @returns An async generator that yields results.  
   *           In `PageFetcher`, the async generator's `next()` method is called lazily, reducing the load on the site.
   */
  fetchPagesSource(chapter: Chapter): AsyncGenerator<Result<P>>;

  /** STEP 3: Parse image information
   *  Parses image information from `pageSource`, mainly: `thumbnailSrc` (optional), `href`, `title`, and organizes them into `ImageNode[]`.  
   *  In some sites, you can also directly get the large image URL (`originSrc`) and image dimensions.
   *  @param pageSource Depending on the generic `<P>`, it could be a document, URL, JSON data, etc.
   *  @returns ImageNode[]
   */
  parseImgNodes(pageSource: P, chapterID?: number): Promise<ImageNode[] | never>;

  /** STEP 4: Fetch the large image URL, or update image title/href
   *  In some sites, the `parseImgNodes` step can already obtain the large image URL (`originSrc`), so you can directly return `{url: node.originSrc!}`.  
   *  Otherwise, you need to request the page document via `node.href` in this step and parse the `originSrc` from it.
   *  @param node ImageNode 
   *  @returns OriginMeta
   */
  fetchOriginMeta(node: ImageNode, retry: boolean, chapterID?: number): Promise<OriginMeta>;

  galleryMeta(chapter: Chapter): GalleryMeta;
  title(chapter: Chapter[]): string;

  /** Process image data
   *  This step can be skipped for most sites — `BaseMatcher` already has a default implementation.  
   *  However, some sites encrypt, scramble, or segment image data. In such cases, this step should handle decryption or restoration.
   */
  processData(data: Uint8Array<ArrayBuffer>, contentType: string, node: ImageNode): Promise<[Uint8Array<ArrayBuffer> | SubData, string]>;
  headers(node: ImageNode): Record<string, string>;
  appendNewChapters(url: string, old: Chapter[]): Promise<Chapter[]>;
}

type SubDataItem = {
  name: string,
  contentType: string,
  data: Uint8Array,
}

export class SubData {
  directory: string;
  list: SubDataItem[];
  extra?: any;
  constructor(directory: string, list: SubDataItem[], extra?: any) {
    this.directory = directory;
    this.list = list;
    this.extra = extra;
  }
  get byteLength() {
    return this.list.map(sd => sd.data.byteLength).reduce((prev, curr) => prev + curr, 0);
  }
};

export abstract class BaseMatcher<P> implements Matcher<P> {

  async *fetchChapters(): AsyncGenerator<Chapter[], Chapter[], Chapter[]> {
    return [new Chapter(0, "Default", window.location.href)];
  }

  abstract fetchPagesSource(source: Chapter): AsyncGenerator<Result<P>, Result<P>, Result<P>>;
  abstract parseImgNodes(pageSource: P, chapterID?: number): Promise<ImageNode[]>;
  abstract fetchOriginMeta(node: ImageNode, retry: boolean, chapterID?: number): Promise<OriginMeta>;

  title(chapter: Chapter[]): string {
    const meta = this.galleryMeta(chapter[0]);
    return meta.originTitle || meta.title || "unknown";
  }

  galleryMeta(_chapter: Chapter): GalleryMeta {
    return new GalleryMeta(window.location.href, document.title || "unknown");
  }

  async processData(data: Uint8Array<ArrayBuffer>, contentType: string, _node: ImageNode): Promise<[Uint8Array<ArrayBuffer> | SubData, string]> {
    return [data, contentType];
  }

  headers(_node: ImageNode): Record<string, string> {
    return {};
  }

  appendNewChapters(_url: string, _old: Chapter[]): Promise<Chapter[]> {
    throw new Error("this site does not support add new chapters yet");
  }

}
