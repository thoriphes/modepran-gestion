/** Textos legales y largos por defecto ([LANG_*]), extraídos de lang/es/panel.php de la app vieja. Clave en minúsculas sin LANG_. Valores HTML. */
export const DEFAULT_LEGAL_TEXTS: Record<string, string> = {
  compliance: `En cumplimiento de la Ley Orgánica de Protección de Datos de carácter personal 15/1999 de 13 de diciembre se le comunica de sus datos están incorporados a un fichero titularidad de <strong>MODEPRAN</strong> con C.I.F.: G-98265705, cuya finalidad es el tratamiento de los mismos con el fin de llevar a cabo la gestión del seguimiento y control de entrega del animal. Se le informa también que puede ejercer los derechos de acceso, rectificación, cancelación y, en su caso, oposición, enviando una solicitud por escrito acompañada por la fotocopia de su D.N.I a la siguiente dirección: <strong>MODEPRAN</strong>. Camino Nuevo de Paterna 165. Benimamet (Valencia)`,
  host_text_top: `REUNIDOS en Valencia, a :fecha_acogida<br><br>
De una parte, <strong>EL ACOGEDOR</strong> :adoptante_name ,mayor de edad, con DNI nº :adoptante_nif , teléfono móvil: :adoptante_phone , correo electrónico: :adoptante_email , y domicilio (acogida) en: :adoptante_address .<br><br>
Y de otra parte la persona representante de la protectora, en representación de <strong>MODEPRAN (Movimiento y Desarrollo por la Protección Animal)</strong>, asociación sin ánimo de lucro con C.I.F. nº G98265705 y sita en el Camino Nuevo de Paterna nº165, 46035 Benimamet (Valencia)<br><br>
<strong>ADOPTANTE Y PROTECTORA</strong>, de común acuerdo, fijan los términos del presente contrato de acogida del animal cuyas características se detallan a continuación:`,
  adoption_text_top: `REUNIDOS en Valencia,<br><br>
De una parte, <strong>EL ADOPTANTE</strong> :adoptante_name ,mayor de edad, con DNI nº :adoptante_nif , teléfono móvil: :adoptante_phone , correo electrónico: :adoptante_email , y domicilio en: :adoptante_address .<br><br>
Y de otra parte <strong>MODEPRAN (Movimiento y Desarrollo por la Protección Animal)</strong>, asociación sin ánimo de lucro con C.I.F. nº G98265705 y sita en el Camino Nuevo de Paterna nº165, 46035 Benimamet (Valencia)<br><br>
<strong>ADOPTANTE Y PROTECTORA</strong>, de común acuerdo, fijan los términos del presente contrato de acogida del animal cuyas características se detallan a continuación:`,
  host_text: `<p><strong>MODEPRAN entrega el animal reseñado, siempre y cuando EL ACOGEDOR acepte cumplir las siguientes condiciones:</strong></p>
<p>1 - El <strong>ACOGEDOR</strong> velará por el cumplimiento de la legislación vigente LEY 2/2023 del 13 de marzo
de la Generalitat Valenciana de protección, Bienestar y Tenencia de animales de compañía y
otras medidas de bienestar animal y cuantas modificaciones se produzcan en relación a esta
ley o normativa de bienestar animal, manteniendo al animal acogido en las condiciones
adecuadas para su bienestar , en los aspectos físico, psíquico y sanitario. Así mismo el
<strong>ACOGEDOR</strong> declara que no pesa sobre él ninguna prohibición judicial o administrativa para la
tenencia de animales.</p>
<p>2 - Todos los animales entregados en acogida por <strong>MODEPRAN</strong>, son exclusivamente de compañía
y para convivir con el acogedor. Si se detectara que el animal en acogida está siendo utilizado
para cualquier otro fin, este podrá ser retirado por <strong>MODEPRAN</strong>. Así mismo el animal no será
vendido ni cedido ni dejado en un deposito de animales o abandonado por el acogedor, ni será
empleado para fines lucrativos o que vulneren los derechos del animal, quedando totalmente
prohibida su utilización para peleas, cría, caza, carreras, experimentación o vivisección. Queda
totalmente prohibido entregar al animal en adopción sin la autorización de <strong>MODEPRAN</strong>, así
como trasladarlo provisionalmente a otro domiciliodistinto al que figura en el presente
contrato, sin previa comunicación y autorización de Modepran.</p>
<p>3 - Quedan prohibidas todo tipo de amputaciones o mutilaciones que obedezcan a razones
estéticas , incluidas el corte de orejas, rabo o cuerdas vocales.</p>
<p>4 - El <strong>ACOGEDOR</strong> es conocedor de que el animal proviene de una protectora de animales , de un
domicilio particular o de la calle, por lo tanto <strong>MODEPRAN</strong> no se hace responsable si en el
momento de la entrega el animal está incubando algún virus, tiene alguna enfermedad o tiene
mas o menos de la edad estimada en el contrato.<strong>MODEPRAN</strong> desconoce el historial veterinario
del animal antes de su llegada a la protectora, pues se trata de animales que han sido
abandonados o maltratados.</p>
<p>5 - El <strong>ACOGEDOR</strong> acepta el seguimiento del animal por parte de Modepran,al objeto de verificar
la adecuada adaptación del mismo a su nuevo entorno. Así como informar a <strong>MODEPRAN</strong> de
cualquier cambio de domicilio o número de teléfono, así como la defunción o perdida del
animal.</p>
<p>6 - El <strong>ACOGEDOR</strong> se compromete a sufragar todos los gastos de alimentación del animal, durante
el tiempo que este en acogida. Los gastos veterinarios del animal serán sufragados por la
protectora, excepto si el animal acogido sufre algún accidente ajeno a la protectora durante su
estancia en acogida, en ese caso será el acogedor el que se haga cargo de los gastos.</p>
<p>7 - En caso del incumplimiento de alguna de las condiciones del presente contrato, Modepran
podrá requerir la devolución del animal en acogida, en cuyo caso el acogedor entregará al
animal voluntariamente y en las debidas condiciones físicas y psíquicas.</p>
<p>8 - Si el <strong>ACOGEDOR</strong> se negara a devolver al animal , se hará cargo de todos los gastos judiciales
acarreados del incumplimiento del contrato.</p>
<p>9 - Desde el momento de la firma de este contrato <strong>MODEPRAN</strong> queda exonerada de toda
responsabilidad civil y/o penal derivada de la custodia o tenencia del animal en acogida por
parte del acogedor.</p>
<p>10 - Los animales de acogida , lo son, de todas las edades y diferentes estados sanitarios , es
decir , debido a sus diferentes orígenes y el tiempo que lleven en Modepran,unos animales
tendrá el proceso vacunal completo y otros no.Por ello cuando el <strong>ACOGEDOR</strong> un animal
consciente de que el protocolo vacunal no esta completado asume el riesgo de que pueda
enfermar , en este caso el animal será atendido por los veterinarios de <strong>MODEPRAN</strong>, pero se
decidiera voluntariamente llevarlo a otro centro veterinario , el acogedor asumirá el coste
derivados de dichos servicios.</p>
<p>11 - Si antes de cumplir los 21 días que establece la ley el responsable legal del animal lo
reclamara y demostrara que es suyo el <strong>ACOGEDOR</strong> deberá entregar al animal de nuevo a
<strong>MODEPRAN</strong> para la devolución de este a su responsable, realizándole por parte de <strong>MODEPRAN</strong>
todos los tratamientos correspondientes de vacunación e implantación de chip tal y como
establece la ley.</p>
<p>12 - El <strong>ACOGEDOR</strong> se compromete a acoger al animal hasta que este encuentre
un nuevo hogar.
El animal no podrá volver a la protectora hasta que encuentre una nueva
familia, en caso de no poder hacerse cargo por fuerza mayor(enfermedad,
hospitalización ) el <strong>ACOGEDOR</strong> podrá devolver el animal a la protectora,
documentando su situación.
Si el <strong>ACOGEDOR</strong>  decidiera adoptar al animal acogido, deberá notificarlo a la
protectora antes de que se haya iniciado el proceso de adopción con otra
familia.</p>
<p>13 - En caso de acoger un animal para adopción que se encuentre en una situación administrativa por la cual no se pueda 
formalizar el contrato de adopción, este no podrá ser devuelto a la protectora, si el acogedor no quisiera hacerse cargo del 
animal tendrá que notificarlo a la protectora para buscarle otro hogar, mientras tanto el animal deberá permanecer en su hogar 
de acogida , a no ser que la protectora solicite la devolución de este por motivos de bienestar animal o fuerza mayor.<br>
Si el acogedor se negara a dar el plazo necesario para buscar otro hogar de acogida , no se realizará devolución del coste de adopción.</p>

<p><strong>EL ACOGEDOR DECLARA:</strong></p>
<p><strong>Haber leído con detenimiento y entendido el contenido integro del presente contrato y
estar conforme con él .</strong><br>
<strong>Así mismo manifiesta que la adopción ha sido consensuada con el resto de personas
que convivirán con el animal adoptado y que están conformes y son conscientes de la
responsabilidad que conlleva la tenencia de un animal y y que esta acogida no
responde a un impulso si no a un acto meditado.</strong></p>`,
  adoption_text: `<p>1 - El <strong>ADOPTANTE</strong> velará por el cumplimiento de la ley vigente, LEY 2/2023 demarzo de
la generalitat valenciana de Protección , Bienestar y Tenencia de animales de compañía
y otras medidas de bienestar animal y cuantas modificaciones y reglamentos que se
produzcan en relación a esta ley o normativa de protección animal, manteniendo al
animal adoptado en las condiciones adecuadas , para su bienestar, el los aspectos
físico, psíquico y sanitario, el adoptante declara ni ninguna sanción referida a malos
tratos a animales.</p>
<p>2 - Todos los animales entregados en adopción por <strong>MODEPRAN</strong> son exclusivamente de
compañía y para convivir con el adoptante en su domicilio. Si se detectara que el
animal adoptado esta siendo utilizado para cualquier otro fin, distinto al acordado este
podrá ser retirado por <strong>MODEPRAN</strong>.<br>
<br>
Así mismo el animal no será vendido, cedido ni dejado en ningún otro centro de
acogida de animales o abandonado por el <strong>ADOPTANTE</strong>, ni será utilizado con fi es
lucrativos o que vulneren los derechos del animal, quedando totalmente su utilización
para cría, caza peleas, carreras o cualquier actividad que se asemeje, a trabajo
experimentación o vivisección.</p>
<p>3 - Si un animal adoptado, no estuviera esterilizado en el momento de su adopción , el
<strong>ADOPTANTE</strong> está obligado a hacerlo y este contrato supone la aceptación del
compromiso de hacerlo , en cuanto alcance la edad recomendada ( entre los 8 y 12
meses) o desaparezca la causa que lo impedía( en caso de tener alguna patología).</p>
<p>4 - Quedan prohibidas todo tipo de amputaciones y mutilaciones que obedezcan a
razones estéticas, incluidas el corte de orejas, rabo y la cordectomia ( corte de cuerdas
vocales).</p>
<p>5 - El microchip, pasaporte, vacunas (heptavalente, trivalente) y vacuna de la rabia
están incluidos en el coste de la adopción.</p>
<p>6 - El <strong>ADOPTANTE</strong> acepta el seguimiento del animal pro parte de MODEPRAN con
objeto de verificar la adecuada adaptación del mismo a su nuevo entorno , lo que
puede incluir visitas domiciliarias en caso de ser necesario.<br>
<br>
El <strong>ADOPTANTE</strong> se compromete a permitir el acceso del personal de <strong>MODEPRAN</strong> para
realizar dichas visitas para valorar el estado del animal adoptado.
En caso de cambio de domicilio o número de teléfono debe de notificarse a la
protectora, así como en caso de fallecimiento del animal ( deberá aportarse informe
veterinario).</p>
<p>7 – En caso de no encontrarse capacitado para continuar encargándose del animal
adoptado , procederá a comunicarlo a <strong>MODEPRAN</strong> para buscar un nuevo adoptante,
hasta ese momento el animal permanecerá con el actual adoptante hasta encontrar
nueva familia para él , el animal no podrá volver a la protectora, salvo en caso de
fuerza mayor lo que deberá de quedar acreditado de antemano.</p>
<p>8 - En caso de incumplimiento de alguna de las condiciones del contrato, <strong>MODEPRAN</strong>
podrá requerir la devolución del animal, el adoptante deberá entregar al animal en las
debidas condiciones físicas y psíquicas.<br>
<br>
Si el <strong>ADOPTANTE</strong> se negara a devolver al animal, se hará cargo de todos los gastos
judiciales acarreados por incumplimiento de contrato., así mismo , en caso de que el
animal presentar daños causados directa o indirectamente por el <strong>ADOPTANTE</strong>, este
asumirá los costes de los tratamientos veterinarios.</p>
<p>9 – Desde el momento que tiene lugar la firma de este contrato y la entrega del animal
adoptado, <strong>MODEPRAN</strong> queda exonerada de la responsabilidad civil y/o penal derivada
de la custodia y tenencia del animal adoptado siendo el adoptante el responsable legal
de este.</p>
<p>10 – El periodo de acogida dentro de la adopción es de 10 dias , si hubiera algún
problema de adaptación o salud del animal dentro de ese plazo el <strong>ADOPTANTE</strong> deberá
comunicarlo a la protectora para buscar posibles soluciones , si no hubiera solución
posible, el animal podrá volverá a la protectora, una vez transcurrido ese plazo el
animal se considerará adoptado a todos los efectos , debiendo cumplir el adoptante
todos los compromisos y condiciones indicadas en el contrato.<br>
<br>
En caso de haber superado el plazo de acogida si el animal desarrollara algún problema
conductual o de salud, el <strong>ADOPTANTE</strong> se compromete a darle el tratamiento necesario,
mediante un profesional cualificado ( educador,etólogo, veterinario, etc).<br>
<br>
El dinero no se reembolsará pasado dicho plazo, si la devolución se realiza dentro del
plazo de acogida la protectorá cobrará 20 euros por gastos de gestión.<br>
<br>
En el caso de adoptar un cachorro (hasta 6 meses) no existe periodo de acogida ya que
se asume por parte del <strong>ADOPTANTE</strong> los cuidados que este necesita, ni tampoco
devolución ni rembolso económico, el adoptante deberá mantener al animal hasta que
la protectora encuentre una nueva familia para el.</p>
<p>11 – <strong>MODEPRAN</strong> desconoce la procedencia de los animales recogidos, asi como el
historial veterinario y vacunal de estos , si pudiera estar incubando alguna enfermedad
o pueda ser portador de alguna y no hubiera mostrado síntomas durante su estancia
en la protectora .<br>
<br>
Si el animal adoptado mostrara síntomas de enfermedad dentro del plazo de acogida
la protectora se hará cargo de las revisiones y tratamiento veterinario, en las
instalaciones.<br>
<br>
Si el <strong>ADOPTANTE</strong> decidiera derivarlo por cuenta propia a otra clínica veterinaria, la
protectora no se hará cargo de los gastos derivados.</p>
<p>12 – En caso de adoptar un animal mayor de 8 años, o los gatos positivos a
inmunodefciencia o leucemia felina la protectora correrá con los gastos de adopción.<br>
<br>
En caso de que el animal adoptado fuera positivo en Leishmania la protectora correrá
con los gastos del primer tratamiento y la sucesiva analítica de control.<br>
<br>
Los gastos veterinarios posteriores correrán a cargo del <strong>ADOPTANTE</strong>, ya sea en nuestros
centros veterinarios o en el de su elección.</p>
<p>13 – Se informa al <strong>ADOPTANTE</strong> queda sujeto a la normativa de protección y bienestar
animal vigente, en especial a la ley 2/2023 del 13 de marzo sobre protección ,
bienestar y tenencia de animales de compañía y otras medidas de bienestar animal,
cuyas infracciones leves, graves , o muy graves conllevan sanciones entre 100 a 45.000
euros, además de posibles sanciones accesorias.</p>
<p>14 Ante cualquier incumplimiento contractual, las partes acuerdan , con renuncia a
cualquier otro fuero y jurisdicción y competencia de los juzgados y tribunales de la
ciudad de Valencia.</p>
<br>
<p><strong>EL ADOPTANTE DECLARA:</strong></p>
<p><strong>Haber leído con detenimiento y entendido el contenido integro del presente contrato y
estar conforme con él .</strong><br>
<br>
<strong>Así mismo manifiesta que la adopción ha sido consensuada con el resto de personas
que convivirán con el animal adoptado y que están conformes y son conscientes de la
responsabilidad que conlleva la tenencia de un animal y y que esta adopción no
responde a un impulso si no a un acto meditado.</strong></p>`,
  adoption_anex1: `<p>El acogedor/adoptante, queda informado a través de este documento, de los riesgos que conlleva la acogida/adopción del :animalType.</p>
<p>Certifica que los animales con los que va a convivir se encuentran debidamente vacunados y se compromete a hacer la cuarentena (14 días) del animal acogido, siguiendo las instrucciones del centro.</p>
<p>En caso de mostrar algún síntoma de enfermedad en dicho periodo de tiempo, el acogedor contactará con la protectora para su revisión veterinaria.</p>
<p>La protectora no se hará cargo de los gastos en clínicas externas sin acuerdo previo por ambas partes.</p>`,
  adoption_anex2: `<p>Con la firma de este anexo, el acogedor consiente que los datos personales recogidos en el contrato de acogida, pueden ser facilitados a la Conselleria competente en materia de protección animal y al Ayuntamiento correspondiente, siempre que lo requieran, tal y como lo establece el art. 23.3 y el art 23.5, a efectos de tener un censo de casas de acogida y de posibles tareas de inspección.</p>`,
  adoption_anex3: `<p><strong>PROTOCOLO EN CASO DE ENFERMEDAD DEL ANIMAL ACOGIDO.</strong></p>
<p>Los animales acogidos pueden no llevar un protocolo de vacunación completo o ser portadores de alguna enfermedad, por lo que recomendamos no juntar con otros animales no vacunados ni con historial veterinario anómalo.</p>
<p>En caso de mostrar algún síntoma de enfermedad una vez en casa, se deberá notificar a la protectora en la mayor brevedad posible y en horario diurno, para que pueda ser revisado por nuestros veterinarios.</p>
<br>
<br>
<p class='mt-3'><strong>Pasos a seguir:</strong></p>
<ul>
    <li><strong>Whatsapp al 661864808</strong>, o enviar mensaje privado vía <strong>Facebook (Modepran Valencia)</strong>, en caso de no poder contactar por estas vías, acudir a la protectora en el horario indicado, de <strong>10 a 14 y de 16 a 19.</strong></li>
    <li>También puedes dirigirte por Whatsapp al <strong>_______________</strong>, de lunes a viernes en el horario de <strong>10 a 14 y de 16 a 19.</strong></li>
    <li>En caso de urgencia nocturna, enviar mensaje vía whatsapp al <strong>_______________</strong> empezando el mensaje con la palabra <strong><u>ACOGIDAURGENCIA</u></strong> y la descripción del problema.</li>
    <li>Este servicio solo se utilizará en caso extremo de gravedad y nuestro servicio de rescate valorará la situación. Este servicio estará activo hasta las 2:00 de la madrugada.</li>
</ul>
<p class='mt-5'>En caso de que el acogedor acuda a alguna clínica veterinaria externa, sin previo aviso y consentimiento de Modepran ni cumpliendo los protocolos indicados, la protectora no se hará cargo de los gastos ocasionados.</p>`,
  adoption_anex4: `<p>El acogedor queda informado a través de este documento de que el animal acogido se encuentra disponible para su adopción a través de Modepran, así como de la asociación colaboradora que la protectora tiene en Alemania.</p>
<p>El animal acogido no es de propiedad de la persona que lo acoge, siendo Modepran, el representante legal del mismo, por lo que el acogedor/adoptante no podrá disponer del animal, ni cederlo ni trasladarlo sin consentimiento de la protectora hasta que no se formalice su adopción.</p>
<p>En caso de querer adoptar al animal acogido se deberá comunicar a la protectora con el fin de formalizar su adopción y retirar al animal de la base de datos de animales en adopción.</p>
<p>En caso de haber algún interesado en el animal acogido, se informará a la casa de acogida inmediatamente, notificando la intención de adoptar al animal con anterioridad a la adopción para que la persona acogedora no haya adoptado y el proceso no podrá ser paralizado.</p>
<p>En el caso de que el animal sea adoptado en Alemania, el proceso de adopción se puede alargar a acudir a las citas veterinarias necesarias que requieran desde Modepran.</p>`,
  lopd: `<p>Los datos de carácter personal serán tratados por MODEPRAN e incorporados a la actividad de tratamiento
ADOPCIONES, cuya finalidad es GESTIÓN DE LOS DATOS DE LAS PERSONAS ADOPTANTES.. La finalidad/es
citada/s está/n basada/s en Ejecución de un contrato o aplicación de medidas precontractuales</p>
<p>Los datos de carácter personal pueden ser comunicados a FUERZAS Y CUERPOS DE SEGURIDAD, MINISTERIO
FISCAL Y AUTORIDAD JUDICIAL; AUTORIDADES ADMINISTRATIVAS.
No existen transferencias internacionales de datos.</p>
<p>Los datos serán conservados durante el tiempo necesario para cumplir con la finalidad para la que se han
recabado y para determinar las posibles responsabilidades que se pudieran derivar de dicha finalidad y del
tratamiento de los datos. Puede ejercitar sus derechos de acceso, rectificación, supresión y portabilidad de sus
datos, de limitación y oposición a su tratamiento, así como a no ser objeto de decisiones basadas únicamente
en el tratamiento automatizado de sus datos, cuando procedan, ante MODEPRAN, Camí Nou de Paterna, 165,
46035, València, Valencia, España en la dirección de correo electrónico
adopciones@protectoramodepran.com</p>
<br><br>
<p><strong>1. ¿Quién es el responsable del tratamiento de sus datos?</strong></p>
<p>MODEPRAN
<ul>
<li>Camí Nou de Paterna, 165 València, Valencia, España</li>
<li>G98265705</li>
<li>661864808</li>
<li>adopciones@protectoramodepran.com</li>
</ul>
</p>
<p><strong>2. ¿Cuál es la finalidad del tratamiento de sus datos?</strong></p>
<p>Tratamos sus datos con las siguientes finalidades:
<ul>
<li>GESTIÓN DE LOS DATOS DE LAS PERSONAS ADOPTANTES.: Los datos personales recabados se
emplean para la formalización de los contratos de adopción y el cumplimiento de las obligaciones
que, por ambas partes, se derivan del contrato de adopción entre la Entidad y las personas
adoptantes. Además, se tratan los datos para realizar una valoración de la persona o personas
adoptantes y para el seguimiento y control veterinario del animal adoptado.</li>
</ul></p>
<p><strong>3. ¿Durante cuánto tiempo conservaremos sus datos?</strong></p>
<p>Conservaremos sus datos durante los siguientes plazos:<ul>
<li>GESTIÓN DE LOS DATOS DE LAS PERSONAS ADOPTANTES.: Indefinido mientras el interesado no
solicite su supresión o mientras el dato no devenga en incorrecto o desactualizado. La base juridica de
este plazo de conservación es</li>
</ul>
</p>
<p><strong>4. ¿Cuál es la legitimación para el tratamiento de sus datos de carácter personal?</strong></p>
<p>GESTIÓN DE LOS DATOS DE LAS PERSONAS ADOPTANTES.: Ejecución de un contrato o aplicación de
medidas precontractuales,</p>
<p><strong>5. ¿A qué destinatarios se comunicarán tus datos?</strong></p>
<p>Los datos de carácter personal podrán ser comunicados a FUERZAS Y CUERPOS DE SEGURIDAD, MINISTERIO
FISCAL Y AUTORIDAD JUDICIAL; AUTORIDADES ADMINISTRATIVAS.</p>
<p><strong>6. ¿Serán sus datos transferidos internacionalmente?</strong></p>
<p>Sus datos personales no serán transferidos internacionalmente</p>
<p><strong>7. ¿Cuáles son sus derechos cuando nos facilita sus datos y cómo puede ejercerlos?</strong></p>
<p>Usted tiene derecho a:
INFORMACIÓN BÁSICA SOBRE PROTECCIÓN DE DATOS
<ul>
<li>Acceder a sus datos de carácter personal.</li>
<li>Solicitar su rectificación.</li>
<li>Solicitar su supresión.</li>
<li>Oponerse a su tratamiento.</li>
<li>Solicitar la limitación de su tratamiento.</li>
<li>La portabilidad de datos personales.</li>
</ul>
</p>
<p>Usted podrá ejercer sus derechos mediante comunicación escrita a MODEPRAN, Camí Nou de Paterna, 165,
46035, València, Valencia, España o en la dirección de correo electrónico
adopciones@protectoramodepran.com</p>
<p>Su solicitud deberá incluir fecha, nombre y apellidos, petición en que se concreta la solicitud, dirección a
efectos de notificaciones. Con el fin de disipar cualquier duda razonable sobre la identidad de la persona física
que cursa la solicitud, se solicita la aportación del DNI o documento de naturaleza análoga o similar, para
confirmar la identidad del mismo.</p>
<p>En caso de entender que no se ha resuelto correctamente su solicitud usted podrá dirigirse a solicitar la tutela
de la Agencia Española de Protección de Datos, cuyo datos puede consultar en www.aepd.es</p>`,
  adoption_engagement_1: `<p>Concertado por<br><br>
De una parte, <strong>EL ADOPTANTE</strong> :adoptante_name ,mayor de edad, con DNI nº :adoptante_nif , teléfono móvil: :adoptante_phone , correo electrónico: :adoptante_email , y domicilio en: :adoptante_address , en plena capacidad de realizar el presente ACUERDO DE COMPROMISO.<br><br>
Y de otra parte <strong>MODEPRAN (Movimiento y Desarrollo por la Proteccióin Animal)</strong>, asociación sin ánimo de lucro con C.I.F. nº G98265705 y sita en el Camino Nuevo de Paterna nº165, 46035 Beniomamet (Valencia)<br><br>
<strong>EL ADOPTANTE</strong> se compromete en el plazo que estipule Modepran a
<br></p>
<ul>`,
  adoption_engagement_sterilized: `<li><strong>Esterilizar al animal. (este periodo podría variar en caso que así lo indique un veterinario)</strong></li>`,
  adoption_engagement_2: `<li><strong>Identificar con el chip obligatorio</strong></li>
</ul>
<br>
<p>En prueba de conformidad, firman ambas partes en:
<br></p>`,
};
