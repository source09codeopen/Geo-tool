import { NextResponse } from "next/server";
import { getCrawlerStatus } from "../../../lib/crawlerStatus";

export async function POST(req) {
  try {
    const { url } = await req.json();
    if (!url) {
      return new NextResponse("URL is required", { status: 400 });
    }

    let absoluteUrl = url;
    if (!/^https?:\/\//i.test(url)) {
      absoluteUrl = `https://${url}`;
    }

    const origin = new URL(absoluteUrl).origin;
    const crawlerStatus = await getCrawlerStatus(origin);

    return NextResponse.json({ crawler_status: crawlerStatus });
  } catch (error) {
    console.error("[RECHECK_CRAWLERS]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
