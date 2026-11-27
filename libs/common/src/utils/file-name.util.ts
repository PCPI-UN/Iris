/**
 * Multer reads multipart file names as latin1, while browsers send them as
 * UTF-8: "Pendón.pdf" arrives as "PendoÌ\x81n.pdf". A name that already holds
 * characters above latin1, or that is not valid UTF-8 once re-read, came in
 * decoded (e.g. through filename*=UTF-8'') and stays as it is.
 */
export const decodeOriginalName = (name: string): string => {
  if ([...name].some((char) => char.charCodeAt(0) > 0xff)) {
    return name;
  }
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? name : decoded;
};
