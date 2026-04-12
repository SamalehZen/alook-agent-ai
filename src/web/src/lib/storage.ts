export async function saveEmailToR2(
  bucket: R2Bucket,
  emailId: string,
  rawEmail: ReadableStream | ArrayBuffer,
) {
  const key = `emails/${emailId}/raw`
  await bucket.put(key, rawEmail, {
    httpMetadata: { contentType: "message/rfc822" },
  })
  return key
}

export async function getEmailPresignedUrl(bucket: R2Bucket, r2Key: string): Promise<string> {
  return r2Key
}

export async function streamEmailBody(bucket: R2Bucket, r2Key: string) {
  const obj = await bucket.get(r2Key)
  if (!obj) return null
  return obj.body
}
