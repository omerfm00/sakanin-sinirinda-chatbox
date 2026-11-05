# Şakanın Sınırında

Öğrencilerin şaka ile akran zorbalığı arasındaki farkı senaryolar, bağlam ve farklı bakış açıları üzerinden düşünerek keşfetmesine yardımcı olan uygulama.

## Gereksinimler

- Node.js 22 veya üzeri ve npm
- Docker Engine ve Docker Compose

## Yerel geliştirme

1. `.env.example` dosyasını `.env` adıyla kopyalayın. Yerel örnek parolayı yalnızca yerel geliştirme için kullanın; paylaşılan ortamlarda değiştirin.
2. Bağımlılıkları kurun: `npm install`
3. Geliştirme servislerini başlatın: `docker compose -f compose.yaml -f compose.dev.yaml up --build`
4. Uygulamalar:
   - Öğrenci: <http://localhost:5173>
   - Öğretmen/uzman: <http://localhost:5174>
   - Yönetici: <http://localhost:5175>
   - API sağlık kontrolü: <http://localhost:3000/api/health>

Uygulamaları ve veritabanını durdurmak için aynı Compose dosyalarıyla `down` komutunu çalıştırın. Veritabanı verileri `postgres_data` volume'unda kalır. Volume'u kaldıran `down -v` komutu verileri siler.

## Derleme ve tür denetimi

- Tüm workspace'leri derleyin: `npm run build`
- TypeScript workspace türlerini denetleyin: `npm run typecheck`
- Tek bir uygulamayı derleyin: `npm run build --workspace apps/student-web` (diğer workspace adları `apps/teacher-web`, `apps/admin-web`, `apps/api`)

## Üretim benzeri yerel Compose

1. `.env.example` dosyasını `.env` olarak kopyalayıp yerel değerleri ayarlayın.
2. `docker compose -f compose.yaml -f compose.prod.yaml up --build -d` komutunu çalıştırın.
3. Arayüzler sırasıyla `http://localhost:8081`, `http://localhost:8082` ve `http://localhost:8083` adreslerinde açılır.

PostgreSQL portu host'a yayımlanmaz; yalnızca Compose iç ağındaki API erişebilir. Servisleri ayrı ayrı yeniden oluşturmak için örneğin `docker compose -f compose.yaml -f compose.dev.yaml up --build api` veya `... up --build student-web` kullanın.

## Ortam değişkenleri

| Değişken | Amaç |
|---|---|
| `POSTGRES_USER` | PostgreSQL kullanıcı adı |
| `POSTGRES_PASSWORD` | PostgreSQL parolası; gerçek ortamlarda güçlü ve gizli tutulmalı |
| `POSTGRES_DB` | Uygulama veritabanı adı |
| `DATABASE_URL` | API'nin PostgreSQL bağlantı adresi |

`.env` dosyası sürüm kontrolü dışındadır. Gerçek sırları `.env.example` dosyasına veya kaynak koda eklemeyin.

## Yapı ve sonraki aşamalar

- `apps/student-web`, `apps/teacher-web`, `apps/admin-web`: ayrı React/Vite uygulamaları
- `apps/api`: NestJS modüler monolit API
- `compose.yaml`, `compose.dev.yaml`, `compose.prod.yaml`: ortak servisler ve yerel/üretim benzeri ayarlar
- `tasks.md`: proje kapsamı, fazlar ve kabul ölçütleri

Mevcut arayüzler yalnızca Phase 1 teknik iskeletidir; senaryo akışları, kimlik doğrulama ve rol bazlı özellikler sonraki fazlarda uygulanacaktır.

## Sunucuya ileride taşıma

Gerçek sunucu, alan adı, DNS, SSH veya SSL işlemi bu projede yapılmaz. Taşıma öncesi `.env` değerlerini güvenli biçimde sağlayın, kalıcı PostgreSQL volume'u için yedekleme/geri yükleme planı hazırlayın ve dış HTTPS sonlandırmasını sizin yöneteceğiniz ters vekil ya da platform katmanında yapılandırın. Alan adları ve dış yönlendirme daha sonra `compose.prod.yaml` ile uyumlu hale getirilebilir. Bu adımlar henüz gerçek bir ortamda doğrulanmamıştır.
