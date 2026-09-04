# Architecture Decision Records (ADR)

ADR は「なぜその技術・構成を選んだのか」を残す短い文書です。

コードを読めば **何をしているか** は分かりますが、
**なぜそうしたのか / 他に何を検討したのか** は残りません。
半年後の自分や、あとから参加する人が
「これ、Cloud SQL でよかったのでは?」と思ったときに
判断の経緯をたどれるようにするのが目的です。

## 一覧

| # | タイトル | 要約 |
|---|---------|------|
| [001](./001-firestore-vs-cloud-sql.md) | Firestore を選んだ理由 | 運用コストとスケールゼロを優先 |
| [002](./002-cloud-run.md) | Cloud Run を選んだ理由 | min instances = 0 で「使わない時間は無料」 |
| [003](./003-storage.md) | 写真を Cloud Storage に置く理由 | Firestore は 1MB 制限。適材適所 |
| [004](./004-auth.md) | Firebase Authentication を使う理由 | 認証は自作しない |
| [005](./005-security.md) | Security Rules と IAM の使い分け | 「誰が」の層が違う |
| [006](./006-aggregation.md) | 経費集計の方式 | MVP では都度集計が最も単純 |

## 書式

各 ADR は以下の構成です。

- **状況 (Context)** — どんな前提・制約があったか
- **決定 (Decision)** — 何を選んだか
- **検討した選択肢 (Options)** — 他に何があり、なぜ選ばなかったか
- **結果 (Consequences)** — この決定で何が良くなり、何を諦めたか
- **見直す条件 (When to revisit)** — どうなったら再検討するか
