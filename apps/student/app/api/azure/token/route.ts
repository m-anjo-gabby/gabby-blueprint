import { NextResponse } from 'next/server';
import { getAzureSpeechToken } from '@gabby/lib/azure/server';

export async function GET() {
  try {
    const token = await getAzureSpeechToken();
    return new NextResponse(token, { status: 200 });
  } catch (error: any) {
    console.error('Token API Error:', error.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}