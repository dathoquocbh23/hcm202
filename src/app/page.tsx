import Link from 'next/link';

export default function HomePage() {
  return <main className="landing">
    <nav className="landing-nav"><Link href="/" className="brand"><span className="brand-mark">✦</span> ĐẤU TRƯỜNG TRI THỨC</Link><div><Link href="/rules">Luật chơi</Link><Link href="/admin">Quản trị</Link></div></nav>
    <section className="hero-grid">
      <div className="hero-copy"><span className="eyebrow">HỌC THÔNG QUA ĐỐI KHÁNG</span><h1>Mỗi câu hỏi là<br /><em>một nước đi.</em></h1><p>Bốn đội. Ba trận đấu. Những thẻ kiến thức, kỹ năng và 15 giây để quyết định. Cùng đội của bạn bước vào bàn đấu.</p><div className="hero-actions"><Link className="button primary" href="/join">Tham gia bằng mã phòng <span>↗</span></Link><Link className="button outline" href="/demo/desk-flow">Xem thử bàn đấu</Link><Link className="button outline" href="/admin">Tạo giải đấu</Link></div><div className="hero-facts"><span><strong>04</strong> đội</span><span><strong>300</strong> HP</span><span><strong>15s</strong> trả lời</span></div></div>
      <div className="hero-illustration" aria-label="Minh họa bàn học và thẻ bài kiến thức"><div className="hero-notebook">ĐẤU TRƯỜNG<br />TRI THỨC <small>GHI CHÉP TRẬN ĐẤU</small></div><div className="hero-table-card hero-back">✦<small>KỸ NĂNG</small></div><div className="hero-table-card hero-front"><small>📜 CÂU HỎI · Q08</small><strong>Độc lập<br />dân tộc</strong><span>15 GIÂY</span></div><div className="hero-pencil" /></div>
    </section>
    <section className="landing-steps"><article><span>01</span><h2>Chọn câu hỏi</h2><p>Đội công rút hai thẻ và chọn một câu để đánh.</p></article><article><span>02</span><h2>Trả lời thông minh</h2><p>Đội thủ chọn đáp án trước khi hết giờ.</p></article><article><span>03</span><h2>Đổi vai liên tục</h2><p>Kiến thức và kỹ năng giúp đội tiến tới chung kết.</p></article></section>
  </main>;
}
