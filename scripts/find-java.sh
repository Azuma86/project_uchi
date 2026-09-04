#!/bin/sh
# Firebase Emulator Suite は Java 製で、firebase-tools v15 以降は JDK 21 以上を要求する。
# システムの既定 Java が古くても、別途入れた JDK 21+ を見つけて JAVA_HOME を返す。
#
#   使い方:  export JAVA_HOME="$(sh scripts/find-java.sh)"
#
# 見つからない場合は空文字を返す (呼び出し側でエラーメッセージを出す)。

major_version() {
  # 例: openjdk version "21.0.12.1" -> 21
  "$1/bin/java" -version 2>&1 \
    | awk -F'"' '/version/ { split($2, v, "."); print (v[1] == "1") ? v[2] : v[1]; exit }'
}

is_supported() {
  [ -x "$1/bin/java" ] || return 1
  v=$(major_version "$1")
  [ -n "$v" ] && [ "$v" -ge 21 ] 2>/dev/null
}

# 1. すでに設定済みの JAVA_HOME が使えるならそれを使う
if [ -n "$JAVA_HOME" ] && is_supported "$JAVA_HOME"; then
  printf '%s' "$JAVA_HOME"
  exit 0
fi

# 2. Homebrew でよくある場所を順に見る
for candidate in \
  /opt/homebrew/opt/openjdk@25 \
  /opt/homebrew/opt/openjdk@23 \
  /opt/homebrew/opt/openjdk@21 \
  /opt/homebrew/opt/openjdk \
  /usr/local/opt/openjdk@21 \
  /usr/local/opt/openjdk
do
  if is_supported "$candidate"; then
    printf '%s' "$candidate"
    exit 0
  fi
done

# 3. macOS の java_home に聞く
if [ -x /usr/libexec/java_home ]; then
  found=$(/usr/libexec/java_home -v 21+ 2>/dev/null)
  if [ -n "$found" ] && is_supported "$found"; then
    printf '%s' "$found"
    exit 0
  fi
fi

# 4. PATH 上の java
if command -v java >/dev/null 2>&1; then
  home=$(dirname "$(dirname "$(command -v java)")")
  if is_supported "$home"; then
    printf '%s' "$home"
    exit 0
  fi
fi

exit 1
