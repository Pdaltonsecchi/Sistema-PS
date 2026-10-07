'''Linterna funciona con una Batería. Al presionar el botón: si está apagada se enciende (si hay carga), si está encendida se 
apaga. Cada instante de tiempo que pasa estando encendida, la batería baja 10%. Si llega a 0%, se apaga sola y no puede volver a 
encenderse hasta recargar (recargar = vuelve a 100%)'''

class Bateria:
    def __init__(self, carga):
        self.carga = carga
        
    def descargar(self):
        self.carga = max(0, self.carga - 10)
        
    def recargar(self):
        self.carga = 100
    
    def __str__(self):
        return f'Batería al {self.carga}%'
        
class Linterna:
    def __init__(self, bateria):
        self.bateria = bateria
        self.encendida = False
        
    def tocar_boton(self):
        if self.encendida:
            self.encendida = False
        else:
            if self.bateria.carga > 0:
                self.encendida = True
    
    def tiempo(self):
        if self.encendida:
            self.bateria.descargar()
            if self.bateria.carga == 0:
                self.encendida = False
    
    def __str__(self):
        if self.encendida:
            estado = 'encendida'
        else:
            estado = 'apagada'
        return f'Linterna {estado}, bateria al {self.bateria.carga}%'

'''Ejercicio: Cafetera y Depósito de Agua

Se desea modelar una Cafetera que funciona con un Depósito de agua.
El depósito tiene una capacidad máxima de 1000 ml. Cada café que prepara la cafetera consume 200 ml de agua.
Al presionar el botón de la cafetera: si el depósito tiene al menos 200 ml, prepara el café (gasta el agua y suma 1 al contador 
de cafés preparados por la cafetera). Si no tiene suficiente agua, no prepara nada.
El depósito se puede rellenar, y al hacerlo vuelve a su capacidad máxima (1000 ml).
Simular la siguiente situación:
El depósito arranca lleno (1000 ml).
Se preparan 5 cafés seguidos (el 5° deja el depósito en 0 ml exactos).
Se intenta preparar un 6° café (no debería poder, porque quedan 0 ml).
Se rellena el depósito.
Se prepara un café más.'''

class Deposito:
    def __init__(self, cantidad_agua):
        self.cantidad_agua = cantidad_agua
        
    def rellenar(self):
        self.cantidad_agua = 1000
    
    def consumir(self):
        self.cantidad_agua -= 200
    
    def __str__(self):
        return f'Cantidad de agua: {self.cantidad_agua} ml'
    
class Cafetera:
    def __init__(self, deposito):
        self.deposito = deposito
        self.cafes_preparados = 0
    
    def tocar_boton(self):
        if self.deposito.cantidad_agua >= 200:
            self.deposito.consumir()
            self.cafes_preparados += 1
        else:
            print('No hay suficiente agua para preparar café') 
    
    def __str__(self):
        return f'Preparaste {self.cafes_preparados} cafes'
        
'''d = Deposito(1000)
c = Cafetera(d)
for _ in range(5):
    c.tocar_boton()
print(c)
c.tocar_boton()
print(c)
d.rellenar()
c.tocar_boton()
print(c)'''

'''Super Plomero

Se desea desarrollar un pequeño juego protagonizado por Super Plomero.
Durante el juego, Super Plomero puede encontrarse con diferentes objetos y personajes.
Super Plomero comienza la partida en estado pequeño.
En el escenario existe una Caja Misterio. Cuando Super Plomero golpea la caja, esta libera un Hongo Mágico. Una caja solamente
puede ser utilizada una vez; después de liberar su contenido queda vacía.
Cuando Super Plomero toma el Hongo Mágico, pasa de estar pequeño a estar grande.
También existe un Enemigo que puede atacar a Super Plomero.
Si Super Plomero está grande y recibe un ataque, vuelve a ser pequeño. Si Super Plomero ya estaba pequeño cuando recibe el ataque, 
pierde la partida.
Se pide modelar el problema utilizando Programación Orientada a Objetos. El programa debe permitir representar al menos los siguientes elementos:

Super Plomero.
Caja Misterio.
Hongo Mágico.
Enemigo.

Cada objeto debe ser responsable de mantener su propio estado y realizar las acciones que le correspondan.
Finalmente, realizar un pequeño programa que simule la siguiente situación:
Super Plomero comienza pequeño.
Golpea una Caja Misterio.
La caja libera un Hongo Mágico.
Super Plomero toma el hongo y se vuelve grande.
Un enemigo ataca a Super Plomero.
Super Plomero vuelve a ser pequeño.
El enemigo vuelve a atacarlo.
Super Plomero pierde la partida.'''

class Hongo_Magico:
    def __init__(self):
        pass
    
class Caja_misterio:
    def __init__(self):
        self.estado_caja = 'con hongo'
        
    def liberar_hongo(self):
        if self.estado_caja == 'con hongo':
            self.estado_caja = 'vacia'  
    
    def __str__(self):
        return f'Estado de la caja: {self.estado_caja}'
    
class Enemigo:
    def __init__(self):
        pass
    def ataque(self, super_plomero):
        super_plomero.recibir_ataque()
        
class Super_plomero:
    def __init__(self):
        self.estado_plomero = 'pequeño' 
    
    def golpear_caja(self, caja_misterio):
        caja_misterio.liberar_hongo()
    
    def tomar_hongo(self):
        self.estado_plomero = 'grande'
        
    def recibir_ataque(self):       
        if self.estado_plomero == 'grande':
            self.estado_plomero = 'pequeño'
        elif self.estado_plomero == 'pequeño':
            self.estado_plomero = 'muerto'
    
    def __str__(self):
        return f'Estado de super plomero: {self.estado_plomero}'
            
'''h = Hongo_Magico()
c = Caja_misterio()
e = Enemigo()
s = Super_plomero()
print(s)
s.golpear_caja(c)
s.tomar_hongo()
print(s)
e.ataque(s)
print(s)
e.ataque(s)
print(s)'''

'''1. Semáforo (el más simple — para calentar motores)

Se desea modelar un Semaforo. Puede estar en tres estados: rojo, amarillo o verde. Arranca en rojo.
Tiene un método cambiar() que lo hace pasar al siguiente estado, siguiendo el ciclo: rojo → verde → amarillo → rojo → verde →...
Simular: el semáforo arranca. Se cambia 5 veces seguidas, imprimiendo el estado después de cada cambio.'''

class Semaforo:
    def __init__(self):
        self.estado = 'rojo'
    
    def cambiar(self):
        if self.estado == 'rojo':
            self.estado = 'verde'
        elif self.estado == 'verde':
            self.estado = 'amarillo'
        else:
            self.estado = 'rojo'
    
    def __str__(self):
        return f'El semaforo esta en {self.estado}'

'''s = Semaforo()
for _ in range(5):
    s.cambiar()
    print(s)'''
    
'''Cuenta Bancaria (una sola clase, pero con una restricción para pensar)

Se desea modelar una CuentaBancaria. Tiene un saldo, que arranca en 0.
Se puede depositar dinero (aumenta el saldo). Se puede retirar dinero, pero solo si hay saldo suficiente — si no alcanza, 
no se retira nada y se avisa con un mensaje.

Simular: se deposita $1000. Se retiran $300. Se intenta retirar $2000 (no debería poder). Se deposita $500. Se retira $1200.'''

class Cuenta_bancaria:
    def __init__(self):
        self.saldo = 0
    
    def depositar(self, monto):
        self.saldo += monto
        
    def retirar(self, monto):
        if self.saldo >= monto:
            self.saldo -= monto
        else:
            print('No hay saldo suficiente para retirar')
        
    def __str__(self):
        return f'Tu saldo es: {self.saldo}'

'''c = Cuenta_bancaria()
c.depositar(1000)
print(c)
c.retirar(300)
print(c)
c.retirar(2000)
print(c)
c.depositar(500)
print(c)
c.retirar(1200)
print(c)'''

'''Cerradura y Llave 

Se desea modelar una Cerradura y una Llave. Cada llave tiene un código.
Cada cerradura tiene su propio código correcto. Al intentar abrir una cerradura con una llave, si el código de la llave coincide 
con el de la cerradura, la cerradura queda abierta. Si no coincide, queda cerrada (o sigue como estaba).
Una cerradura abierta se puede volver a cerrar manualmente en cualquier momento.

Simular: cerradura con código "A1" (arranca cerrada). Se intenta abrir con una llave de código "B2" (no debería abrir). Se 
intenta abrir con una llave de código "A1" (sí debería abrir). Se cierra manualmente. Se intenta abrir de nuevo con la llave "B2".'''

class Llave:
    def __init__(self, codigo_llave):
        self.codigo_llave = codigo_llave
    
class Cerradura:
    def __init__(self, codigo_cerradura):
        self.codigo_cerradura = codigo_cerradura
        self.estado = 'cerrada'
    
    def abrir(self, llave):
        if self.codigo_cerradura == llave.codigo_llave:
            self.estado = 'abierta'
        else:
            pass
    
    def cerrar(self):
        self.estado = 'cerrada'
        
    def __str__(self):
        return f'La cerradura esta {self.estado}'

'''l1 = Llave('B2')
l2 = Llave('A1')
c = Cerradura('A1')
c.abrir(l1)
print(c)
c.abrir(l2)
print(c)
c.cerrar()
print(c)
c.abrir(l1)
print(c)'''

'''1. Biblioteca

Se desea modelar un sistema de préstamos de una Biblioteca. Existen Libros y Socios.
Un libro puede estar disponible o prestado. Un socio puede tener como máximo 2 libros prestados a la vez.
Cuando un socio pide prestado un libro: si el libro está disponible y el socio no superó su límite, el préstamo se concreta 
(el libro pasa a prestado, el socio suma uno a su cantidad de libros prestados). Si no se cumple alguna de las dos condiciones, 
el préstamo no se realiza.
Cuando un socio devuelve un libro, el libro vuelve a estar disponible y el socio resta uno a su cantidad de libros prestados.

Simular la siguiente situación:
Un socio pide prestado el libro A (disponible). Se concreta.
El mismo socio pide prestado el libro B (disponible). Se concreta.
El mismo socio pide prestado el libro C (disponible). No se concreta (llegó al límite).
El socio devuelve el libro A.
El socio pide prestado el libro C. Ahora sí se concreta.'''

class Libro:
    def __init__(self, nombre):
        self.nombre = nombre
        self.estado = 'disponible'

    def prestar(self):
        self.estado = 'prestado'

    def devolver_libro(self):
        self.estado = 'disponible'

    def __str__(self):
        return f'Libro {self.nombre}: {self.estado}'


class Socio:
    def __init__(self):
        self.cantidad_libros = 0

    def pedir_prestado(self, libro):
        if libro.estado == 'disponible':
            if self.cantidad_libros < 2:
                self.cantidad_libros += 1
                libro.prestar()
            else:
                print('Llegó al límite de libros prestados')
        else:
            print('El libro no está disponible')

    def devolver(self, libro):
        self.cantidad_libros -= 1
        libro.devolver_libro()

    def __str__(self):
        return f'Socio con {self.cantidad_libros} libros prestados'

'''l1 = Libro('A')
l2 = Libro('B')
l3 = Libro('C')
s = Socio()
s.pedir_prestado(l1)
print(s, '-', l1)
s.pedir_prestado(l2)
print(s, '-', l2)
s.pedir_prestado(l3)
print(s, '-', l3)
s.devolver(l1)
print(s, '-', l1)
s.pedir_prestado(l3)
print(s, '-', l3)'''

'''Ascensor

Se desea modelar un Ascensor que se mueve entre pisos de un edificio, y Pasajeros que lo llaman.
El ascensor tiene un piso actual (arranca en el piso 0) y una capacidad máxima de 4 pasajeros. Lleva registro de cuántos 
pasajeros tiene adentro en este momento (arranca vacío).
Un pasajero puede subir al ascensor, pero solo si no está lleno. Un pasajero puede bajar del ascensor.
El ascensor se puede mover a un piso determinado, pero solo si tiene al menos un pasajero adentro (no se mueve vacío).

Simular la siguiente situación:
El ascensor está en el piso 0, vacío.
Suben 3 pasajeros.
El ascensor se mueve al piso 5.
Bajan 2 pasajeros.
Suben 3 pasajeros más (atención: ver si entran todos).
El ascensor se mueve al piso 1.'''

class Pasajero:
    def __init__(self):
        pass

class Ascensor:
    def __init__(self):
        self.cantidad_pasajeros = 0
        self.piso = 0
        
    def 