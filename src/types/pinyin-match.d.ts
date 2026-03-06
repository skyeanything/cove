declare module "pinyin-match" {
  interface PinyinMatch {
    match(text: string, query: string): number[] | false;
  }

  const PinyinMatch: PinyinMatch;
  export default PinyinMatch;
}
