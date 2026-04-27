export default function Modal({ title, children, onClose, wide = false }) {
  return (
    <div className="modalBackdrop" onMouseDown={onClose}>
      <div className={`modal ${wide ? 'wide' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <h2>{title}</h2>
          <button className="iconButton" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
