import { GalleryMeta } from "../../download/gallery-meta";
import ImageNode from "../../img-node";
import { Chapter } from "../../page-fetcher";
import { evLog } from "../../utils/ev-log";
import { ADAPTER } from "../adapt";
import { BaseMatcher, OriginMeta, Result } from "../platform";

type KomiicChapter = {
  id: string,
  serial: string,
  type: "chapter" | "book",
  dateCreated: string,
  dateUpdated: string,
  size: number,
}
// type KomiicChapters = {
//   data: {
//     chaptersByComicId: KomiicChapter[],
//   }
// }
type KomiicImage = {
  id: string,
  kid: string,
  height: number,
  width: number,
  comicId: string,
  chapterId: string,
  __typename: "Image"
}

type KomiicComicInfo = {
  id: string,
  title: string, //"新妹魔王的契約者·嵐",
  status: "ONGOING",
  year: number, // 2015,
  imageUrl: string // "https://public.komiic.com/comics/c0e30ef5bf2e02ad2bcd9932197bfc7c/cover.jpg",
  authors: {
    id: string // "73",
    name: string,// "上棲綴人",
  }[],
  categories: {
    id: string, // "1",
    name: string, //"愛情",
  }[],
  dateCreated: string,// "2021-10-28T00:56:05Z",
  "dateUpdated": string, //"2023-04-09T01:43:22Z",
  views: number, // 26570,
  favoriteCount: number, //602,
  lastBookUpdate: string,// "04",
  lastChapterUpdate: string, //"18",
}

class KomiicMatcher extends BaseMatcher<KomiicImage[]> {

  chapterType: Record<string, { display: string, sort: number }>;
  meta?: GalleryMeta;

  constructor() {
    super()
    this.chapterType = { chapter: { display: "话", sort: 1 }, book: { display: "卷", sort: 0 } };
  }

  galleryMeta(_chapter: Chapter): GalleryMeta {
    if (this.meta) return this.meta;
    return new GalleryMeta(window.location.href, document.title);
  }

  async *fetchChapters(): AsyncGenerator<Chapter[]> {
    const id = window.location.href.match(/comic\/(\d+)/)?.[1];
    if (!id) throw new Error("cannot get comic id");
    const data = await fetch(`${window.location.origin}/api/query`, {
      "headers": { "Content-Type": "application/json" },
      "body": JSON.stringify({
        operationName: "chapterByComicId",
        query: "query chapterByComicId($comicId: ID!) {\n chaptersByComicId(comicId: $comicId) {\n id\n serial\n type\n dateCreated\n dateUpdated\n size\n __typename\n }\n}",
        variables: { comicId: id }
      }),
      "method": "POST",
      "mode": "cors"
    }).then(res => res.json());

    // gallery meta
    try {
      const comicInfoRes = await fetch(`${window.location.origin}/api/query`, {
        "headers": { "Content-Type": "application/json" },
        "body": JSON.stringify({
          operationName: "comicById",
          query: "query comicById($comicId: ID!) {\n comicById(comicId: $comicId) {\n id\n title\n status\n year\n imageUrl\n authors {\n id\n name\n __typename\n }\n categories {\n id\n name\n __typename\n }\n dateCreated\n dateUpdated\n views\n favoriteCount\n lastBookUpdate\n lastChapterUpdate\n __typename\n }\n}",
          variables: { comicId: id }
        }),
        "method": "POST",
        "mode": "cors"
      }).then(res => res.json());
      const cInfo = comicInfoRes.data.comicById as KomiicComicInfo;
      this.meta = new GalleryMeta(window.location.href, cInfo.title);
      this.meta.tags.authors = cInfo.authors.map(a => a.name);
      this.meta.tags.categories = cInfo.categories.map(a => a.name);
    } catch (err) {
      evLog("error", "fetch comic info error", err);
    }

    let chapters = data.data.chaptersByComicId as KomiicChapter[];
    chapters = chapters.sort((a, b) => this.chapterType[a.type].sort - this.chapterType[b.type].sort);
    yield chapters.map(c => new Chapter(parseInt(c.id), c.serial + this.chapterType[c.type].display, id + "/" + c.id))
  }

  async *fetchPagesSource(ch: Chapter): AsyncGenerator<Result<KomiicImage[]>> {
    const images = await fetch(`${window.location.origin}/api/query`, {
      "headers": { "Content-Type": "application/json" },
      "body": JSON.stringify({
        operationName: "imagesByChapterId",
        query: "query imagesByChapterId($chapterId: ID!) {\n imagesByChapterId(chapterId: $chapterId) {\n id\n kid\n height\n width\n __typename\n }\n}",
        variables: { chapterId: ch.source.split("/").pop() }
      }),
      "method": "POST",
      "mode": "cors"
    }).then(res => res.json());

    const [comicId, chapterId] = ch.source.split("/");
    const ret: KomiicImage[] = (images.data.imagesByChapterId as Omit<KomiicImage, "comicId" | "chapterId">[]).map(img => {
      return { comicId, chapterId, ...img };
    })
    yield Result.ok(ret);
  }

  async parseImgNodes(images: KomiicImage[]): Promise<ImageNode[]> {
    const digits = images.length.toString().length;
    return images.map((img, i) => {
      const url = `${window.location.origin}/api/image/${img.kid}`;
      const name = (i + 1).toString().padStart(digits, "0");
      const href = `${window.location.origin}/comic/${img.comicId}/chapter/${img.chapterId}/page/1`;
      return new ImageNode("", href, name + ".webp", undefined, url, { w: img.width, h: img.height });
    })
  }

  headers(node: ImageNode): Record<string, string> {
    return {
      "Accept": "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5",
      "Referer": node.href,
    }
  }

  async fetchOriginMeta(node: ImageNode): Promise<OriginMeta> {
    return { url: node.originSrc! };
  }

}

ADAPTER.addSetup({
  name: "komiic.com",
  workURLs: [
    /komiic.com\/comic\/\d+\/?$/,
  ],
  match: ["https://komiic.com/*"],
  constructor: () => new KomiicMatcher(),
});
