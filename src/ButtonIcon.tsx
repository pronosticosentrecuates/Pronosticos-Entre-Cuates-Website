import type { CSSProperties } from 'react'

type IconName = 'abrir' | 'aceptar' | 'admin' | 'agregar' | 'aleatorio' | 'bloquear'
  | 'buscar' | 'cancelar' | 'cerrar' | 'descargar-pdf' | 'editar' | 'eliminar'
  | 'entrar' | 'exportar-csv' | 'facebook' | 'finalizar' | 'guardar' | 'importar'
  | 'inicio' | 'limpiar' | 'menu' | 'pagar' | 'premio' | 'publicar' | 'registro'
  | 'salir' | 'whatsapp'

/** Decorative icons inherit the control's color; its text or aria-label supplies the name. */
export function ButtonIcon({ name }: { name: IconName }) {
  return <span className="button-icon" aria-hidden="true" style={{
    '--button-icon-url': `url("${import.meta.env.BASE_URL}iconos/${name}.svg")`,
  } as CSSProperties} />
}
