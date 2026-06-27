import { NextResponse } from "next/server";

export async function GET() {
  const servers: { id: number; url: string }[] = [];
  for (let i = 1; i <= 10; i++) {
    const url = process.env[`XC_SERVER_${i}`];
    if (url) {
      servers.push({ id: i, url });
    }
  }
  return NextResponse.json(servers);
}
