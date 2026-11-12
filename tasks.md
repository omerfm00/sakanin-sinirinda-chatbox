# Şakanın Sınırında — Proje Görevleri

Bu dosya, kullanıcı tarafından verilen ürün ve altyapı gereksinimlerinden oluşturulmuş ilk proje taslağıdır. Kapsam, Phase 0 mimari önerisi onaylandıktan sonra kullanıcıyla birlikte netleştirilebilir.

## Ürün ilkeleri ve değişmez gereksinimler

- [ ] Öğrencilerin şaka ile akran zorbalığı arasındaki farkı senaryolar, bağlam bilgisi, farklı bakış açıları ve düşünme etkinlikleriyle keşfetmesini sağla.
- [ ] Öğrencinin yorumunu doğru/yanlış olarak değerlendirme; kesin sınıflandırma açıklama ve görüşe bağlı ödül verme.
- [ ] Katılımı ve tamamlamayı destekle; yansıtıcı sorularla öğrencinin fikrini yeniden değerlendirebilmesine alan aç.
- [ ] Öğrenci sorularını, yanıtlarını, ilerlemesini ve kişisel yansımalarını varsayılan olarak özel tut; öğrenci verisine erişimi sahibine sınırla.
- [ ] Öğrenci, öğretmen/uzman ve yönetici arayüzlerini birbirinden bağımsız derlenip dağıtılabilir tut; ortak backend API ve PostgreSQL kullan.
- [ ] Ön yüz, backend ve veritabanını ayrı Docker servislerinde çalıştır; PostgreSQL'i dış ağa açma ve verisini Docker volume ile kalıcı kıl.
- [ ] Alan adı satın almadan yerelde çalışmayı, tek Docker Compose projesini, geliştirme/üretim override'larını ve servisleri bağımsız yeniden derlemeyi destekle.
- [ ] Gizli ve ortama özel değerleri environment variable ile yönet; gerçek sunucu, DNS, alan adı veya SSL işlemi yapma.

## Phase 0 — Mimari ve kapsam onayı

- [x] Önerilen teknoloji yığınını, modüler monolit mimarisini ve servis sınırlarını açıkla.
- [x] Bağımsız ön yüzler, backend, ortak veritabanı ve Docker Compose dosya yapısını öner.
- [x] Başlangıç veri modelini, kimlik doğrulama/yetkilendirme yaklaşımını ve öğrenci verisi gizlilik sınırlarını öner.
- [x] Test stratejisini, faz sırasını, varsayımları ve teknik ödünleşimleri sun.
- [x] Uygulama geliştirmesine başlamadan önce kullanıcının açık mimari onayını al.

## Phase 1 — Proje iskeleti ve yerel altyapı

- [x] Öğrenci, öğretmen/uzman ve yönetici uygulamalarını ayrı ayrı derlenebilir/deploy edilebilir çalışma alanları olarak kur.
- [x] Ortak API kullanan modüler monolit backend iskeletini kur.
- [x] PostgreSQL için ayrı Docker servisi, kalıcı volume ve yalnızca iç ağ bağlantısı ekle.
- [x] Tek Compose projesinde geliştirme ve üretim override'larını hazırla; servislerin bağımsız derleme/başlatma akışlarını doğrula.
- [x] Örnek environment dosyası ve yerel çalıştırma/ileride sunucuya taşıma dokümantasyonu ekle; gerçek sırları depoya koyma.
- [x] Kurulum, derleme ve temel servis sağlık kontrollerini çalıştırıp sonuçları doğrula.

Phase 1 doğrulaması: Geliştirme Compose projesi çalıştırıldı; üç arayüz host'tan HTTP 200, API sağlık kontrolü HTTP 200 döndürdü ve PostgreSQL sağlıklı duruma geçti. Şema tabloları oluşturuldu, kalıcı volume doğrulandı ve PostgreSQL için host port eşlemesi olmadığı incelendi. Üretim override'ı ayrı bir Compose projesinde başlatıldı; üç Nginx arayüzü ve Nginx üzerinden API sağlık isteği HTTP 200 döndürdü. Öğrenci servisi bağımsız yeniden derlendi; tüm üretim imajları oluşturuldu. `npm run build` ve `npm run typecheck` başarılı oldu. Uygulama ağı ile yalnızca API ve veritabanını birleştiren izole iç `data` ağı, yerel host portlarını erişilebilir kılacak şekilde ayrıldı.

## Phase 2 — Kimlik, roller ve özel öğrenci verileri

- [ ] Öğrenci, öğretmen/uzman ve yönetici rolleri için kimlik doğrulama ve sunucu tarafı yetkilendirme uygula.
- [x] `student`, `teacher` ve `admin` türündeki hesapları kullanıcı adı/parola JSON şablonundan güvenli ve atomik olarak içe aktar.
- [x] Tanıtım sayfası ve rol seçtirmeyen ortak giriş ekle; başarılı girişte role göre doğru uygulamaya yönlendir.
- [ ] Öğrenciye ait soru, yanıt, ilerleme ve yansıtma kayıtlarını öğrenci kimliğiyle ilişkilendir.
- [ ] Öğrenci API erişimlerinde sahiplik kontrolünü sunucu tarafında uygula; başka öğrencinin kayıtlarına erişimi engelle.
- [ ] Kimlik doğrulama, rol sınırları ve kayıt sahipliği için otomatik testler ekle ve çalıştır.

Phase 2 ilerleme notu: Kullanıcı adı/parola ile giriş, sunucu oturumu, JSON üzerinden rol tipli hesap içe aktarma ve role göre yönlendirme eklendi. Senaryo yanıtları öğrenci kimliğiyle saklanıp yalnızca sahibine açılıyor. Öğrenci soruları ve ayrı ilerleme kayıtları ile otomatik yetkilendirme testleri henüz tamamlanmadı. Tüm Phase 2 kabul ölçütleri tamamlanmamıştır.

Kimlik/giriş değişikliği doğrulaması: JSON şablonundan öğrenci, öğretmen ve yönetici hesapları oluşturulup her rolün doğru arayüze yönlendiği tarayıcıda doğrulandı. Oturumsuz öğretmen adresinin ortak girişe yönlenmesi, tanıtım sayfası ve yalnızca kullanıcı adı/parola isteyen ortak giriş de doğrulandı. Geçici test hesapları ve `config/users.json` silindi; kalıcı veritabanı volume'u korundu. `npm run build`, `npm run typecheck`, `npm audit --omit=dev` ve geliştirme/üretim Compose yapılandırma kontrolleri başarılıdır. Üç arayüz ve API sağlık kontrolü HTTP 200 döndürmektedir.

## Phase 3 — Senaryolar ve öğrenci öğrenme akışı

- [ ] Senaryo, bağlam bilgisi, farklı bakış açıları ve yansıtıcı soruları sunan işlevsel öğrenci akışı geliştir.
- [ ] Öğrencinin yanıtlarını ve ilerlemesini kaydet; kişisel yansımaları varsayılan olarak özel tut.
- [ ] Doğru/yanlış geri bildirimi, kesin zorbalık sınıflandırması veya görüşe bağlı ödül üretmediğini doğrula.
- [ ] Öğrenme akışını ve gizlilik davranışlarını otomatik testlerle doğrula.

Phase 3 ilerleme notu: İçerik başlangıç verisi olmadan modüler senaryo API'si ve yönetici taslak/yayın akışı eklendi. Öğrenciler yalnızca yayımlanmış senaryoları görüp yansıtıcı yanıtlarını kendi hesaplarına kaydedebiliyor; doğru/yanlış değerlendirmesi üretilmiyor. Uçtan uca veritabanı doğrulaması ve otomatik gizlilik testleri Docker/PostgreSQL ortamında henüz çalıştırılmadı.

## Phase 4 — Öğretmen/uzman ve yönetici akışları

- [ ] Öğretmen/uzman arayüzünde izin verilen eğitimsel içerik ve grup kullanım akışlarını geliştir.
- [ ] Yönetici arayüzünde senaryo ve eğitim içeriği yönetimini geliştir.
- [ ] Yetkili rollerin erişimini doğrula; öğrencinin özel yansıtma ve yanıtlarını açık bir yetkilendirme gereksinimi olmadan paylaşma.
- [ ] Rol bazlı arayüz ve API davranışlarını otomatik testlerle doğrula.

## Phase 5 — Bütünleşik doğrulama ve teslim

- [ ] Üç ön yüzü ve backend'i ortak Docker Compose projesinde yerel olarak çalıştırıp uçtan uca akışları doğrula.
- [ ] Test, lint ve build kontrollerini çalıştır; başarısızlıkları gider.
- [ ] Üretim yapılandırması, environment variable listesi, yedekleme/kalıcılık ve ileride sunucuya taşıma adımlarını belgele.
- [ ] Gerçek sunucu, DNS, alan adı, kimlik bilgisi veya SSL işlemi yapılmadığını açıkça belirt.
- [ ] Yalnızca uygulanmış ve test edilmiş görevleri tamamlandı olarak işaretle; kalan işleri ve bilinen sorunları raporla.
