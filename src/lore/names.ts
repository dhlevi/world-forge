import type { Rng } from '../gen/rng';
import { CULTURES } from '../names/cultures';
import type { NameBank } from '../names/names';

/**
 * People's names for the realms' rulers, heirs, courts and houses: given names by culture and
 * sex, name order (family name first in the East), patronymics, epithets and house names.
 */

const pick = <T>(rnd: Rng, a: readonly T[]): T => a[Math.floor(rnd() * a.length)];

/** What each culture's people and tongue are called, and the folk they are (humans unless elves or dwarves). */
export const CULTURE_LABEL: Record<string, { name: string; folk: string }> = {
  anglo: { name: 'Anglish', folk: 'Humans' }, norse: { name: 'Nordic', folk: 'Humans' }, latin: { name: 'Latin', folk: 'Humans' },
  celtic: { name: 'Celtic', folk: 'Humans' }, elvish: { name: 'Elvish', folk: 'Elves' }, desert: { name: 'Desert', folk: 'Humans' },
  slavic: { name: 'Slavic', folk: 'Humans' }, dwarven: { name: 'Dwarvish', folk: 'Dwarves' }, southern: { name: 'Southron', folk: 'Humans' },
  steppe: { name: 'Steppe', folk: 'Humans' }, jungle: { name: 'Jungle', folk: 'Humans' }, sinic: { name: 'Sinic', folk: 'Humans' },
  japonic: { name: 'Japonic', folk: 'Humans' }, koreanic: { name: 'Koreanic', folk: 'Humans' }, woodland: { name: 'Woodland', folk: 'Humans' },
  highland: { name: 'Highland', folk: 'Humans' },
};
export const cultureId = (c: number) => CULTURES[c]?.id ?? 'anglo';
export const cultureLabel = (c: number) => CULTURE_LABEL[cultureId(c)]?.name ?? 'Unknown';

const GIVEN: Record<string, [string[], string[]]> = {
  anglo: [
    [
      'Edric', 'Aldous', 'Godwin', 'Osric', 'Wulfstan', 'Edmund', 'Harold', 'Leofric', 'Aelfred', 'Cuthbert', 
      'Oswin', 'Wilfred', 'Edgar', 'Raynald', 'Gilbert', 'Roger', 'Walter', 'Hugh', 'Stephen', 'Geoffrey', 
      'Henry', 'Richard', 'Simon', 'Robert', 'Thomas', 'Alaric', 'Aethelred', 'Hereward', 'Eadwig', 'Aethelstan', 
      'Bardolf', 'Kenelm', 'Everard', 'Giles', 'Fulke', 'Rannulf', 'Godric', 'Wymond', 'Osbert', 'Waltheof', 
      'Peverel', 'Hamund', 'Bertram', 'Dunstan', 'Jocelyn', 'Anketil', 'Hamon', 'Warnebald', 'Eustace', 'Marmaduke'
    ],
    [
      'Aethelflaed', 'Edith', 'Godiva', 'Mildred', 'Hilda', 'Matilda', 'Eleanor', 'Margery', 'Rowena', 'Isabel', 
      'Alys', 'Joan', 'Agnes', 'Cecily', 'Maud', 'Elfrida', 'Winifred', 'Ermengarde', 'Beatrice', 'Rosamund', 
      'Eadgyth', 'Aethelthryth', 'Sybil', 'Hawise', 'Idonea', 'Clarice', 'Avice', 'Millicent', 'Gillian', 'Rohesia', 
      'Basilia', 'Helewise', 'Lecelina', 'Gunnora', 'Philippa', 'Avis', 'Eothend', 'Aelgifu', 'Richenda', 'Lettice'
    ],
  ],
  norse: [
    [
      'Ragnar', 'Harald', 'Sigurd', 'Bjorn', 'Eirik', 'Olaf', 'Halfdan', 'Ivar', 'Thorvald', 'Gunnar', 
      'Ulf', 'Sven', 'Knut', 'Hakon', 'Sverre', 'Arnulf', 'Ketil', 'Thorgrim', 'Vemund', 'Asmund', 
      'Orm', 'Hrolf', 'Torstein', 'Egil', 'Leif', 'Styrkar', 'Gorm', 'Brand', 'Erling', 'Skarde', 
      'Thorbjorn', 'Hallfred', 'Bersi', 'Ottar', 'Geir', 'Ingolf', 'Kari', 'Snorri', 'Vestar', 'Tryggvi', 
      'Valgard', 'Sighvat', 'Hraenar', 'Runolf', 'Thrain', 'Einar', 'Arne', 'Bard', 'Gudmund', 'Jorund'
    ],
    [
      'Astrid', 'Sigrid', 'Ingrid', 'Gunnhild', 'Thyra', 'Ragnhild', 'Freydis', 'Helga', 'Ylva', 'Aslaug', 
      'Thora', 'Gudrun', 'Signy', 'Hallveig', 'Ingeborg', 'Solveig', 'Brynja', 'Ragna', 'Torhild', 'Thordis', 
      'Gudrid', 'Osk', 'Aud', 'Hildur', 'Dalla', 'Finna', 'Svanhild', 'Jorunn', 'Aesa', 'Kora', 
      'Vigdris', 'Eldrid', 'Rannveig', 'Herdis', 'Bera', 'Ingibjorg', 'Valgerd', 'Greta', 'Lif', 'Asta'
    ],
  ],
  latin: [
    [
      'Aurelian', 'Marcellus', 'Lucan', 'Cassian', 'Valerian', 'Octavian', 'Severin', 'Lucius', 'Florian', 'Corvin', 
      'Tiberio', 'Matteo', 'Lorenzo', 'Alessandro', 'Federico', 'Cosimo', 'Ottavio', 'Gaius', 'Decimus', 'Sabinus', 
      'Ambrose', 'Vitale', 'Fabrizio', 'Rinaldo', 'Aetius', 'Flavius', 'Titus', 'Tacitus', 'Valerius', 'Claudian', 
      'Magnus', 'Vespasius', 'Silvanus', 'Maximian', 'Sergius', 'Caius', 'Hadrian', 'Aemilius', 'Julian', 'Cornelius', 
      'Constantine', 'Belisarius', 'Domitian', 'Narses', 'Gennaro', 'Niccolo', 'Bartolomeo', 'Jacopo', 'Valerio', 'Uberto'
    ],
    [
      'Aurelia', 'Livia', 'Julia', 'Octavia', 'Valeria', 'Flavia', 'Lucrezia', 'Isotta', 'Beatrice', 'Caterina', 
      'Bianca', 'Costanza', 'Giulia', 'Serafina', 'Claudia', 'Drusilla', 'Lavinia', 'Ottavia', 'Cornelia', 'Lucilla', 
      'Sabina', 'Marcella', 'Faustina', 'Domitia', 'Antonia', 'Camilla', 'Gaienne', 'Agripina', 'Violante', 'Ginevra', 
      'Simonetta', 'Alessandra', 'Eleonora', 'Maddalena', 'Francesca', 'Fiammetta', 'Zenobia', 'Porcia', 'Tullia', 'Flaminia'
    ],
  ],
  celtic: [
    [
      'Brannoc', 'Cormac', 'Fergus', 'Conall', 'Niall', 'Domnall', 'Aedan', 'Cathal', 'Ruadh', 'Owain', 
      'Gruffydd', 'Rhodri', 'Cadwal', 'Brennus', 'Eochaid', 'Lugaid', 'Tadhg', 'Dyfnwal', 'Maelgwn', 'Ciaran', 
      'Uisdean', 'Morcant', 'Oisin', 'Diarmuid', 'Lorcán', 'Cynan', 'Iorwerth', 'Caradog', 'Maelcoluim', 'Fiachra', 
      'Artur', 'Murchad', 'Donnchad', 'Finlay', 'Bhaltair', 'Cináed', 'Padrig', 'Bedwyr', 'Gwilym', 'Gareth', 
      'Diarmaid', 'Llewellyn', 'Mabon', 'Macsen', 'Gideon', 'Bran', 'Breasal', 'Eachann', 'Dónal', 'Sweeney'
    ],
    [
      'Brigid', 'Aoife', 'Niamh', 'Deirdre', 'Gwenllian', 'Rhiannon', 'Morrigan', 'Eithne', 'Sorcha', 'Una', 
      'Nest', 'Angharad', 'Medb', 'Grainne', 'Cerys', 'Fionnuala', 'Branwen', 'Ailbhe', 'Sadhbh', 'Róisín', 
      'Dearbhla', 'Mairead', 'Elen', 'Blodeuwedd', 'Sian', 'Heledd', 'Caitlín', 'Finnguala', 'Muirenn', 'Fedelma', 
      'Caitriona', 'Eilidh', 'Gormlaith', 'Emer', 'Catrin', 'Olwen', 'Eira', 'Elora', 'Siobhán', 'Sinead'
    ],
  ],
  elvish: [
    [
      'Aelindor', 'Thalion', 'Caladrel', 'Faelar', 'Ithilmar', 'Elrion', 'Saelith', 'Arandil', 'Galathir', 'Lorimel', 
      'Merethil', 'Silvaran', 'Taurendil', 'Ylvarin', 'Caelborn', 'Erevan', 'Aerandir', 'Vaelis', 'Finrael', 'Oreluin', 
      'Celegorm', 'Eärendil', 'Fëanor', 'Voronwë', 'Amras', 'Haldir', 'Legolas', 'Aegnor', 'Gildor', 'Ingwë', 
      'Maedhros', 'Lindir', 'Rilvan', 'Oropher', 'Elros', 'Círdan', 'Valandil', 'Celebrimbor', 'Galdor', 'Theron'
    ],
    [
      'Aelinwe', 'Ithilsa', 'Lirael', 'Nimriel', 'Sylvara', 'Taelis', 'Elanwe', 'Aerwyn', 'Caelith', 'Mirael', 
      'Galadis', 'Nerys', 'Faelith', 'Ilmara', 'Vaelra', 'Eirwen', 'Lusiel', 'Amaris', 'Galadriel', 'Arwen', 
      'Idril', 'Lúthien', 'Celebrían', 'Aredhel', 'Míriel', 'Finduilas', 'Nellas', 'Melian', 'Anárion', 'Nimloth', 
      'Elenna', 'Vána', 'Silmariel', 'Laurelin', 'Eirien', 'Nariel', 'Elora', 'Rilwen', 'Tariel', 'Yavanna'
    ],
  ],
  desert: [
    [
      'Harun', 'Yusuf', 'Rashid', 'Tariq', 'Faisal', 'Khalid', 'Mansur', 'Nasir', 'Salah', 'Zahir', 
      'Hamid', 'Idris', 'Jafar', 'Malik', 'Qasim', 'Rafiq', 'Suleiman', 'Walid', 'Yazid', 'Murad', 
      'Kamal', 'Bahram', 'Selim', 'Hakim', 'Faruq', 'Bilal', 'Imran', 'Mustafa', 'Nabil', 'Osman', 
      'Hamza', 'Habib', 'Abbas', 'Ziyad', 'Sami', 'Hassan', 'Hussein', 'Asad', 'Danish', 'Faris', 
      'Latif', 'Suhail', 'Ma\'mun', 'Barakat', 'Nizar', 'Taimur', 'Rida', 'Jalal', 'Shakir', 'Ghiyas'
    ],
    [
      'Zubaida', 'Fatima', 'Layla', 'Yasmin', 'Shirin', 'Amira', 'Nadira', 'Samira', 'Zahra', 'Khadija', 
      'Aisha', 'Rania', 'Soraya', 'Parisa', 'Jamila', 'Mahsa', 'Dunya', 'Safiya', 'Halima', 'Roxana', 
      'Aziza', 'Amina', 'Nour', 'Laila', 'Shadia', 'Habiba', 'Zulaykha', 'Inas', 'Badria', 'Sahar', 
      'Mariam', 'Hind', 'Asma', 'Dalia', 'Farida', 'Najwa', 'Reem', 'Tahira', 'Huda', 'Wafa'
    ],
  ],
  slavic: [
    [
      'Mstislav', 'Yaroslav', 'Vladimir', 'Sviatoslav', 'Boleslav', 'Vsevolod', 'Rostislav', 'Izyaslav', 'Dobrynya', 'Bogdan', 
      'Casimir', 'Vratislav', 'Zbigniew', 'Radomir', 'Stanimir', 'Borislav', 'Miroslav', 'Lyubomir', 'Svetopolk', 'Dragomir', 
      'Vyacheslav', 'Gleb', 'Igor', 'Oleg', 'Premysl', 'Wladyslaw', 'Kazimierz', 'Jaromir', 'Leszek', 'Mezadir', 
      'Branislav', 'Sudislav', 'Radoslav', 'Velimir', 'Vojtech', 'Ratibor', 'Miloslav', 'Dushi', 'Stanislav', 'Blagoy', 
      'Tichomir', 'Vecheslav', 'Boledar', 'Cestmir', 'Kresimir', 'Svetozar', 'Zdenek', 'Zlatko', 'Vladislav', 'Goran'
    ],
    [
      'Olga', 'Lyudmila', 'Dobrava', 'Rogneda', 'Zoria', 'Milena', 'Vesna', 'Dragomira', 'Svetlana', 'Bozena', 
      'Radmila', 'Zlata', 'Miroslava', 'Yaroslava', 'Desislava', 'Kseniya', 'Libusa', 'Wanda', 'Svetlana', 'Danica', 
      'Svyatoslava', 'Bogdana', 'Stanislava', 'Milica', 'Zdenka', 'Radoslava', 'Daria', 'Vlada', 'Jadwiga', 'Kinga', 
      'Kazimiera', 'Boleslawa', 'Miloslava', 'Premyslava', 'Vjera', 'Slavica', 'Branislava', 'Svetozara', 'Marzena', 'Mira'
    ],
  ],
  dwarven: [
    [
      'Thrand', 'Borin', 'Durgan', 'Baldrek', 'Gromli', 'Hargrim', 'Korin', 'Murdin', 'Nordri', 'Orsik', 
      'Rurik', 'Thordak', 'Ulfgar', 'Vondal', 'Brundar', 'Dagnal', 'Frar', 'Gimlur', 'Harbek', 'Kildrak', 
      'Morgran', 'Torvek', 'Thorin', 'Balin', 'Dwalin', 'Gloin', 'Oin', 'Bifur', 'Bofur', 'Bombur', 
      'Dain', 'Thror', 'Fundin', 'Kili', 'Fili', 'Nali', 'Narvi', 'Garmur', 'Durnir', 'Brimir', 
      'Brokk', 'Eitri', 'Sindri', 'Dvalin', 'Thorgrun', 'Kazadur', 'Kragur', 'Strakeln', 'Barundar', 'Balthor'
    ],
    [
      'Dagny', 'Helja', 'Kathra', 'Mardred', 'Riswynn', 'Torbera', 'Vistra', 'Amber', 'Bardryn', 'Dis', 
      'Eldeth', 'Gunnloda', 'Hlin', 'Liftrasa', 'Sannl', 'Torgga', 'Gurdis', 'Ilde', 'Kristryd', 'Kila', 
      'Nalred', 'Tamok', 'Kragra', 'Tordis', 'Dwanil', 'Finellen', 'Vondra', 'Brakka', 'Gimra', 'Throra', 
      'Kora', 'Runnal', 'Tasma', 'Audhild', 'Freyde', 'Brida', 'Hulda', 'Loda', 'Skadi', 'Thora'
    ],
  ],
  southern: [
    [
      'Andronikos', 'Basil', 'Nikephoros', 'Alexios', 'Theodoros', 'Manuel', 'Konstantinos', 'Leon', 'Demetrios', 'Isaakios', 
      'Michael', 'Stephanos', 'Kallias', 'Lysander', 'Perikles', 'Timon', 'Kleon', 'Philon', 'Xenon', 'Agathon', 
      'Nikandros', 'Ioannes', 'Komnenos', 'Doukas', 'Laskaris', 'Palaiologos', 'Georgios', 'Stavros', 'Constantinos', 'Anastasios', 
      'Eustathios', 'Bartholomaios', 'Niketas', 'Christopher', 'Gennadios', 'Spyridon', 'Christodoulos', 'Polykarpos', 'Ignatios', 'Pantoleon', 
      'Symeon', 'Cosmas', 'Damian', 'Philotheos', 'Tarchaneiotes', 'Phokas', 'Romanos', 'Skleros', 'Taronites', 'Votaneiates'
    ],
    [
      'Theodora', 'Irene', 'Zoe', 'Anna', 'Eudokia', 'Helena', 'Sophia', 'Thekla', 'Kassia', 'Theophano', 
      'Maria', 'Kallisto', 'Phaedra', 'Xanthe', 'Aspasia', 'Damaris', 'Lysandra', 'Eirene', 'Ariadne', 'Euphrosyne', 
      'Pulcheria', 'Marina', 'Catherine', 'Melania', 'Agatha', 'Pelagia', 'Barbara', 'Christina', 'Paraskevi', 'Styliani', 
      'Despoina', 'Evdokia', 'Glykeria', 'Kallirhoe', 'Polyxeni', 'Kassandra', 'Evgenia', 'Thalia', 'Athenais', 'Sebasteia'
    ],
  ],
  steppe: [
    [
      'Temur', 'Batu', 'Ogedai', 'Toghrul', 'Arslan', 'Kaidu', 'Mongke', 'Jochi', 'Berke', 'Subutai', 
      'Tolui', 'Khubil', 'Esen', 'Altan', 'Bayan', 'Chagan', 'Nogai', 'Orda', 'Tarkhan', 'Yesugei', 
      'Khutula', 'Qutlugh', 'Chagatai', 'Hulagu', 'Arik', 'Burchi', 'Kassar', 'Jalair', 'Abaqa', 'Tekuder', 
      'Tokhtamysh', 'Mamai', 'Tamerlane', 'Inalchuk', 'Sartaq', 'Qara', 'Kormichi', 'Dayir', 'Guchu', 'Muqali', 
      'Jebe', 'Koke', 'Korumshi', 'Saban', 'Ulagchi', 'Tode', 'Chormaqan', 'Baiju', 'Boroldai', 'Eljigidey'
    ],
    [
      'Borte', 'Sorghaghtani', 'Khutulun', 'Oghul', 'Toregene', 'Alaqai', 'Mandukhai', 'Chabi', 'Hoelun', 'Ebegei', 
      'Altani', 'Checheyigen', 'Yesui', 'Kokochin', 'Saran', 'Tuyaa', 'Erdene', 'Naran', 'Yesugen', 'Ibaka', 
      'Arughan', 'Tegulen', 'Qutui', 'Doquz', 'Bayan', 'Bulugan', 'Nogai', 'Altai', 'Tsetseg', 'Enkhtuyaa', 
      'Bolormaa', 'Goyot', 'Oyuun', 'Solongo', 'Bayarmaa', 'Khulan', 'Monguljin', 'Aytana', 'Tengri', 'Narantuyaa'
    ],
  ],
  jungle: [
    [
      'Itzcoatl', 'Kinich', 'Yaxun', 'Chak', 'Balam', 'Tepeu', 'Xocoyotl', 'Ahuitzotl', 'Kukul', 'Yuknoom', 
      'Pakal', 'Huemac', 'Cuauhtli', 'Tizoc', 'Xiuhtecatl', 'Ixtli', 'Kan', 'Ozomatli', 'Uxmal', 'Tlaloc', 
      'Cuitlahuac', 'Moctezuma', 'Maxtla', 'Nezahualcoyotl', 'Nezahualpilli', 'Totoquihuaztli', 'Chimalpopoca', 'Acamapichtli', 'Huitzilihuitl', 'Axayacatl', 
      'Kak Tiliw', 'Siyaj K\'ak', 'Bird Jaguar', 'Shield Jaguar', 'Hasaw Chan', 'Yax Ehb', 'Spearthrower Owl', 'Smoke Imix', 'Fire Is Born', 'Sun K\'inich'
    ],
    [
      'Ixchel', 'Xochitl', 'Ixtab', 'Citlali', 'Itzel', 'Yaretzi', 'Nicte', 'Sac', 'Zazil', 'Atziri', 
      'Tonantzin', 'Xiadani', 'Ameyali', 'Coatl', 'Malinalli', 'Necahual', 'Quetzalli', 'Yolotli', 'Lady Six Sky', 'Lady Xoc', 
      'Lady K\'abel', 'Lady Mutal', 'Lady B\'alaj', 'Lady Wak', 'Lady Yohl', 'Lady Chak', 'Lady Zutuil', 'Atotoztli', 'Tecuichpo', 'Cihuacoatl', 
      'Coatlicue', 'Chalmecacihuatl', 'Chantico', 'Mayahuel', 'Tlazolteotl', 'Huihtaca', 'Iztaccihuatl', 'Matlalcueye', 'Chalchiuhtlicue', 'Xilonen'
    ],
  ],
  sinic: [
    [
      'Wen', 'Jian', 'Zhen', 'Hong', 'Rui', 'Xuan', 'Yong', 'Tai', 'Shen', 'Long', 
      'Ming', 'Kang', 'Heng', 'Jun', 'Qian', 'Zhao', 'Wei', 'Cheng', 'Shao', 'Yuan', 
      'Feng', 'Huai', 'Bo', 'Chao', 'Guang', 'Hao', 'Jing', 'Lei', 'Peng', 'Song', 
      'Tao', 'Xiang', 'Yang', 'Yi', 'Zhi', 'Zhong', 'Bao', 'De', 'Dong', 'Guo', 
      'Han', 'Lian', 'Liang', 'Sheng', 'Shu', 'Tian', 'Xian', 'Zhe', 'Zhi', 'Zhuo'
    ],
    [
      'Lian', 'Mei', 'Hua', 'Yu', 'Xiu', 'Lan', 'Zhu', 'Jing', 'Ying', 'Qiao', 
      'Rong', 'Shu', 'Xia', 'Yan', 'Ling', 'Fen', 'Hui', 'Zhen', 'An', 'Bao', 
      'Chun', 'Fang', 'Gui', 'Hong', 'Jia', 'Ju', 'Liling', 'Min', 'Ning', 'Ping', 
      'Qing', 'Ru', 'Shuang', 'Ting', 'Xiang', 'Xue', 'Ya', 'Yue', 'Yun', 'Zhi', 
      'Zhen', 'Fei', 'Jiao', 'Lu', 'Niu', 'Pei', 'Shan', 'Ting', 'Wan', 'Xian'
    ],
  ],
  japonic: [
    [
      'Harunobu', 'Kagetora', 'Masamune', 'Nobuhide', 'Takauji', 'Yoshitsune', 'Kiyomori', 'Ujimasa', 'Terumoto', 'Motonari', 
      'Hidetada', 'Ietsuna', 'Katsuyori', 'Mitsuhide', 'Nagamasa', 'Sadamori', 'Tadakatsu', 'Yorimasa', 'Kanetsugu', 'Toshiie', 
      'Nobunaga', 'Ieyasu', 'Hideyoshi', 'Shingen', 'Kenshin', 'Masayuki', 'Yukimura', 'Yoshitsugu', 'Ujiyasu', 'Muneshige', 
      'Miyamoto', 'Sakon', 'Ranmaru', 'Naomasa', 'Yasumasa', 'Kagekatsu', 'Katsuie', 'Nagahide', 'Kazumasu', 'Mitsunari', 
      'Ujisato', 'Hideaki', 'Kiyomasa', 'Masanori', 'Yoshitaka', 'Tadamasa', 'Tadatsugu', 'Mochitora', 'Norisada', 'Tameyoshi'
    ],
    [
      'Tomoe', 'Nene', 'Oichi', 'Kasuga', 'Masako', 'Hisako', 'Chiyo', 'Ginchiyo', 'Kiyohime', 'Murasaki', 
      'Sakura', 'Akiko', 'Haru', 'Yodo', 'Teruko', 'Fusako', 'Sen', 'Komatsu', 'Nohime', 'Aya', 
      'Naotora', 'Gotoku', 'Tachibana', 'Sena', 'Kasa', 'Yuki', 'Tshedo', 'Izumi', 'Katsuko', 'Sayo', 
      'Tama', 'Matsu', 'Kaede', 'Kiku', 'Ume', 'Ina', 'Gou', 'Daimyo', 'Suwo', 'Ren'
    ],
  ],
  koreanic: [
    [
      'Seon', 'Jun', 'Hwan', 'Taejo', 'Wang', 'Myeong', 'Gyeong', 'Hyeon', 'Seok', 'Yong', 
      'Jeong', 'Cheol', 'Ho', 'Min', 'Sung', 'Jin', 'Hyeok', 'Taek', 'Kwang', 'Il', 
      'Gwanggaeto', 'Sejong', 'Eulji', 'Gim', 'Yi', 'Chae', 'Gang', 'Ryu', 'Jang', 'Song', 
      'Yun', 'Choe', 'Suh', 'Bae', 'Goo', 'Gyu', 'Beom', 'Sang', 'Won', 'Woo', 
      'Dae', 'Dong', 'Do', 'Chan', 'Geon', 'Ha', 'Hyun', 'Jae', 'Seung', 'Kyung'
    ],
    [
      'Seonhwa', 'Myeongseong', 'Deokman', 'Jindeok', 'Hyeon', 'Sunjeong', 'Yeong', 'Mi', 'Jiwon', 'Haeun', 
      'Soyeon', 'Eunbi', 'Hwaseon', 'Nari', 'Sora', 'Yuna', 'Bora', 'Ara', 'Inhyeon', 'Janghui', 
      'Sindo', 'Wongyeong', 'Insu', 'Ansun', 'Jeonghyun', 'Munjeong', 'Insun', 'Inwon', 'Jeongsun', 'Sunwon', 
      'Inryeong', 'Hyegyeong', 'Danui', 'Seonui', 'Myeongui', 'Geum', 'Chae', 'Aeri', 'Eun', 'Min'
    ],
  ],
  woodland: [
    [
      'Grey Owl', 'Black Hawk', 'Red Cloud', 'Running Elk', 'Two Rivers', 'Tall Pine', 'Swift Otter', 'Stands-in-Fire', 
      'White Bear', 'Thunder Voice', 'Lone Wolf', 'Many Horses', 'Quiet Fox', 'Iron Shell', 'Broken Bow', 'Far Walker', 
      'Sitting Bull', 'Crazy Horse', 'Tecumseh', 'Geronimo', 'Cochise', 'Pontiac', 'Osceola', 'Red Jacket', 'Little Turtle', 
      'Ten Bears', 'Gall', 'Spotted Tail', 'Rain-in-the-Face', 'Crow Dog', 'Kicking Bear', 'American Horse', 'Two Strike', 
      'Chief Joseph', 'White Antelope', 'Left Hand', 'Black Kettle', 'Roman Nose', 'Duluth', 'Brave Bear'
    ],
    [
      'Morning Star', 'Bright Water', 'White Doe', 'Singing Wind', 'Blue Heron', 'Little Dove', 'Falling Leaf', 'Moon Rising', 
      'Sweet Grass', 'Red Willow', 'Spotted Fawn', 'Snow Bird', 'Laughing Brook', 'Wild Rose', 'Dawn Light', 'Corn Tassel', 
      'Sacagawea', 'Pocahontas', 'Lozen', 'Dahteste', 'Pine Leaf', 'Buffalo Calf Road', 'Pretty Nose', 'Running Eagle', 
      'Moving Robe', 'Minnehaha', 'Golden Rod', 'Silver Willow', 'Sun Flower', 'Cloud Dancer', 'Whispering Pines', 'Star Flower', 
      'Winter Moon', 'Summer Rain', 'Spring Blossom', 'Autumn Sky', 'Quiet Lake', 'Dancing Feather', 'Soft Breeze', 'Gentle Rain'
    ],
  ],
  highland: [
    [
      'Huaman', 'Inti', 'Pachac', 'Tupac', 'Yupanqui', 'Atoc', 'Cusi', 'Mayta', 'Sinchi', 'Capac', 
      'Amaru', 'Huascar', 'Rumi', 'Wiraq', 'Achachi', 'Paullu', 'Sayri', 'Titu', 'Urco', 'Waman', 
      'Pachacuti', 'Viracocha', 'Lloque', 'Manco', 'Apu', 'Chalcuchima', 'Quizquiz', 'Rumiñahui', 'Vilca', 'Huayna', 
      'Auqui', 'Tito', 'Illapa', 'Mallku', 'Kuntur', 'Anka', 'Catari', 'Puma', 'Uturuncu', 'Yawar'
    ],
    [
      'Ocllo', 'Quilla', 'Chaska', 'Coya', 'Sisa', 'Mama', 'Rawa', 'Killa', 'Tika', 'Yupay', 
      'Cusi', 'Ima', 'Pacha', 'Sumaq', 'Waylla', 'Kantu', 'Nina', 'Uchu', 'Chimpu', 'Rawa', 
      'Micay', 'Anahuarque', 'Chungui', 'Curi', 'Pillku', 'Kori', 'Urpi', 'Tamya', 'Sonqo', 'Aklla', 
      'Iskra', 'Tiyana', 'Kushi', 'Illari', 'Allpa', 'Asiriy', 'Kukuli', 'Hawka', 'Mallki', 'Nizam'
    ],
  ],
};

/** Family-name-first cultures, and their surnames (generated where none are listed). */
const SURNAME_FIRST = new Set(['sinic', 'japonic', 'koreanic']);
const SINIC_FAMILY = ['Li', 'Zhao', 'Wang', 'Liu', 'Chen', 'Yang', 'Huang', 'Zhou', 'Wu', 'Xu', 'Sun', 'Ma', 'Zhu', 'Hu', 'Guo', 'He', 'Lin', 'Gao', 'Luo', 'Song', 'Han', 'Tang', 'Feng', 'Cao', 'Xiao', 'Deng'];
const KOREANIC_FAMILY = ['Kim', 'Yi', 'Pak', 'Choe', 'Jeong', 'Kang', 'Jo', 'Yun', 'Jang', 'Im', 'Han', 'Shin', 'Seo', 'Gwon', 'Hwang', 'Ahn', 'Song', 'Yu', 'Hong', 'Jeon'];
const JAPONIC_A = ['Taka', 'Masa', 'Naga', 'Hosa', 'Ota', 'Mina', 'Hata', 'Asa', 'Kuro', 'Shima', 'Mori', 'Kita', 'Ima', 'Oda', 'Toku', 'Uesu', 'Sana', 'Hoji', 'Kiyo', 'Fuji'];
const JAPONIC_B = ['da', 'kawa', 'moto', 'mura', 'gawa', 'zu', 'yama', 'hara', 'sugi', 'no', 'ta', 'saki', 'hashi', 'mori', 'naga', 'jo'];

export interface PersonName {
  given: string;
  /** Family or clan name, where the culture uses one in speech. */
  family?: string;
  /** "Ragnar Haraldsson", "Harun ibn Yusuf", "Takeda Harunobu". */
  full: string;
}

/** A given name for someone of this culture. */
export function givenName(cul: string, female: boolean, rnd: Rng): string {
  const g = GIVEN[cul] ?? GIVEN.anglo;
  return pick(rnd, female ? g[1] : g[0]);
}

/**
 * A person's name: given name, then the culture's surname form (a patronymic, a clan name, or
 * the house name in the family-name-first cultures).
 */
export function personName(cul: string, female: boolean, rnd: Rng, house?: House, father?: string): PersonName {
  const given = givenName(cul, female, rnd);
  const fa = father ?? givenName(cul, false, rnd);
  if (SURNAME_FIRST.has(cul) && house) return { given, family: house.short, full: `${house.short} ${given}` };
  switch (cul) {
    case 'norse': {
      const stem = fa.replace(/r$/, '').replace(/ ?$/, '');
      return { given, full: `${given} ${stem}${female ? 'sdottir' : 'sson'}` };
    }
    case 'desert':
      return { given, full: `${given} ${female ? 'bint' : 'ibn'} ${fa}` };
    case 'celtic':
      return { given, full: `${given} ${female ? 'ferch' : rnd() < 0.5 ? 'mac' : 'ap'} ${fa}` };
    case 'dwarven':
      return { given, full: `${given} ${female ? 'daughter' : 'son'} of ${fa}` };
    case 'slavic':
      return { given, full: given };
    default:
      return { given, full: given };
  }
}

export interface House {
  id: number;
  /** "House Ashford", "the Banu Rashid", "the Zhao clan". */
  name: string;
  /** The bare name ("Ashford", "Zhao"). */
  short: string;
  culture: number;
  /** House this one is a cadet branch of, or -1. */
  cadetOf: number;
  /** Year founded. */
  founded: number;
  motto: string;
  /** Seat of the house (where its founder held land). */
  seatName: string;
}

const MOTTO = [
  'We Do Not Kneel', 'Faith and Steel', 'Ever Vigilant', 'By Right of Blood', 'Honour Above All', 'The Tide Rises', 'From Ash, Fire', 'Steadfast',
  'None Shall Pass', 'Light in Darkness', 'We Endure', 'Strength Through Unity', 'Fortune Favours the Bold', 'Our Word Is Iron', 'The Crown Remembers',
  'Root and Branch', 'First to Ride', 'Glory to the Faithful', 'Patience Wins', 'Through Storm', 'Ours Is the Harvest', 'Silent and Sure',
  'The Stars Guide Us', 'Hold Fast', 'Blood Will Tell', 'Without Fear', 'Sword and Plough', 'Wisdom Before Wrath', 'The Old Ways', 'Watch and Wait',
];

/** A house name in the manner of a culture, from a root in its phonology. */
export function houseName(cul: string, culture: number, rnd: Rng, bank: NameBank, seatName: string): { name: string; short: string } {
  const c = CULTURES[culture] ?? CULTURES[0];
  const root = rnd() < 0.35 && seatName ? seatName : bank.proper(c, rnd);
  switch (cul) {
    case 'sinic': {
      const f = pick(rnd, SINIC_FAMILY);
      return { name: `the ${f} clan`, short: f };
    }
    case 'koreanic': {
      const f = pick(rnd, KOREANIC_FAMILY);
      return { name: `the ${f} clan of ${seatName || root}`, short: f };
    }
    case 'japonic': {
      const f = pick(rnd, JAPONIC_A) + pick(rnd, JAPONIC_B);
      return { name: `the ${f} clan`, short: f };
    }
    case 'norse': {
      const f = rnd() < 0.5 ? `${root.replace(/[aeiou]$/, '')}ing` : root;
      return { name: rnd() < 0.5 ? `the ${f}s` : `House ${f}`, short: f };
    }
    case 'desert':
      return rnd() < 0.5 ? { name: `the Banu ${root}`, short: root } : { name: `the ${root}id dynasty`, short: `${root}id` };
    case 'slavic': {
      const f = `${root.replace(/[aeiouy]$/, '')}ovich`;
      return { name: `the ${f}i`, short: f };
    }
    case 'celtic':
      return rnd() < 0.5 ? { name: `Clann ${root}`, short: root } : { name: `the Ui ${root}`, short: root };
    case 'dwarven':
      return rnd() < 0.5 ? { name: `Clan ${root}`, short: root } : { name: `the Line of ${root}`, short: root };
    case 'steppe':
      return { name: `the ${root} clan`, short: root };
    case 'southern':
      return rnd() < 0.5 ? { name: `the ${root.replace(/[aeiou]s?$/, '')}id dynasty`, short: `${root.replace(/[aeiou]s?$/, '')}id` } : { name: `House ${root}`, short: root };
    case 'latin':
      return rnd() < 0.5 ? { name: `House of ${root}`, short: root } : { name: `the ${root.replace(/[aeiou]$/, '')}i family`, short: `${root.replace(/[aeiou]$/, '')}i` };
    case 'elvish':
      return { name: `House ${root}`, short: root };
    case 'jungle':
    case 'highland':
      return { name: `the ${root} lineage`, short: root };
    case 'woodland': {
      const totem = pick(rnd, ['Bear', 'Wolf', 'Turtle', 'Hawk', 'Deer', 'Heron', 'Beaver', 'Snipe', 'Eel', 'Crane', 'Otter', 'Eagle']);
      return { name: `the ${totem} Clan`, short: totem };
    }
    default:
      return { name: `House ${root}`, short: root };
  }
}

export const houseMotto = (rnd: Rng) => pick(rnd, MOTTO);

/** Epithets: [general, by culture]. Some follow a ruler's traits. */
const EPITHET_ANY = [
  'the Bold', 'the Wise', 'the Just', 'the Pious', 'the Cruel', 'the Great', 'the Fat', 'the Tall', 'the Young', 'the Old', 'the Lame', 'the Fair', 'the Good',
  'the Unready', 'the Peaceful', 'the Conqueror', 'the Builder', 'the Lawgiver', 'the Mad', 'the Black', 'the Red', 'the Lion', 'the Fox', 'the Quarrelsome',
  'the Generous', 'the Stern', 'the Learned', 'the Saint', 'the Restorer', 'the Unlucky', 'the Victorious', 'the Silent', 'the Magnificent', 'the Wanderer',
  'the Avenger', 'the Usurper', 'the Elder', 'the Hunter', 'the Merciful', 'the Terrible', 'the Debonair', 'the Steadfast',
];
const EPITHET_CUL: Record<string, string[]> = {
  norse: ['Bloodaxe', 'Ironside', 'Fairhair', 'Forkbeard', 'Snake-in-the-Eye', 'the Boneless', 'Bluetooth', 'Longship', 'Wolf-Coat', 'Skull-Splitter'],
  celtic: ['of the Hundred Battles', 'Red Hand', 'the Raven', 'Long-Arm', 'of the Nine Hostages', 'the Bard'],
  desert: ['the Magnificent', 'the Lion of the Faith', 'the Thunderbolt', 'the Lawgiver', 'the Victorious', 'the Golden'],
  steppe: ['the Scourge', 'the Lame', 'Iron Khan', 'the Black Wind', 'Storm of the Steppe'],
  slavic: ['the Terrible', 'the Wise', 'Long-Arm', 'Big Nest', 'the Bold', 'the Brave'],
  dwarven: ['Ironfist', 'Stonehelm', 'Deepdelver', 'Anvilbrow', 'Firebeard', 'Hammerhand', 'Goldgrip'],
  elvish: ['the Starlit', 'Silverbough', 'the Eternal', 'Dawnbringer', 'the Fair', 'Moonsinger'],
  anglo: ['the Confessor', 'Lionheart', 'Longshanks', 'Ironside', 'Beauclerc', 'Lackland', 'Crookback'],
  latin: ['the Magnificent', 'the Elder', 'the Younger', 'Barbarossa', 'Africanus', 'the Gouty', 'the Unconquered'],
  southern: ['the Peaceful', 'Porphyrogennetos', 'the Philosopher', 'the Hoplite', 'the Stoic', 'the Purple-Born'],
  sinic: ['the Martial', 'the Civil', 'the Radiant', 'the Benevolent', 'the Resplendent', 'the Founder'],
  japonic: ['the Tiger of the Hills', 'the One-Eyed Dragon', 'the Demon', 'the Peacemaker', 'the Fox'],
  koreanic: ['the Great', 'the Wise', 'the Builder', 'the Founder', 'the Righteous'],
  woodland: [], highland: ['Earth-Shaker', 'the Reformer', 'Son of the Sun'],
  jungle: ['the Smoking Shield', 'Jaguar Paw', 'Flint Sky', 'the Obsidian Serpent'],
};
const TRAIT_EPITHET: Record<string, string[]> = {
  Brave: ['the Bold', 'the Lion', 'the Brave'], Cruel: ['the Cruel', 'the Terrible', 'the Black'], Pious: ['the Pious', 'the Saint', 'the Confessor'],
  Just: ['the Just', 'the Lawgiver', 'the Good'], Scholarly: ['the Learned', 'the Wise', 'the Philosopher'], Generous: ['the Generous', 'the Magnificent'],
  Mad: ['the Mad', 'the Strange'], Ambitious: ['the Conqueror', 'the Great'], Craven: ['the Unready', 'the Timid'], Cunning: ['the Fox', 'the Spider'],
};

export function epithet(cul: string, rnd: Rng, traits: string[]): string | undefined {
  if (cul === 'woodland') return undefined;
  if (rnd() > 0.55) return undefined;
  for (const t of traits) if (TRAIT_EPITHET[t] && rnd() < 0.6) return pick(rnd, TRAIT_EPITHET[t]);
  const own = EPITHET_CUL[cul] ?? [];
  return own.length && rnd() < 0.35 ? pick(rnd, own) : pick(rnd, EPITHET_ANY);
}

/** just straight up rip from CK3, maybe I should modify a bit! */
export const TRAITS = [
  'Brave', 'Craven', 'Just', 'Cruel', 'Pious', 'Cynical', 'Ambitious', 'Content', 'Generous', 'Greedy', 'Scholarly', 'Unlettered', 'Cunning', 'Honest',
  'Wrathful', 'Patient', 'Diligent', 'Slothful', 'Paranoid', 'Trusting', 'Charming', 'Shy', 'Sickly', 'Robust', 'Mad', 'Melancholy', 'Gregarious', 'Zealous',
];
const OPPOSED: Record<string, string> = {
  Brave: 'Craven', Craven: 'Brave', Just: 'Cruel', Cruel: 'Just', Pious: 'Cynical', Cynical: 'Pious', Ambitious: 'Content', Content: 'Ambitious',
  Generous: 'Greedy', Greedy: 'Generous', Scholarly: 'Unlettered', Unlettered: 'Scholarly', Cunning: 'Honest', Honest: 'Cunning', Wrathful: 'Patient',
  Patient: 'Wrathful', Diligent: 'Slothful', Slothful: 'Diligent', Paranoid: 'Trusting', Trusting: 'Paranoid', Charming: 'Shy', Shy: 'Charming',
  Sickly: 'Robust', Robust: 'Sickly', Melancholy: 'Gregarious', Gregarious: 'Melancholy',
};

/** Two or three traits that do not contradict each other. */
export function traits(rnd: Rng): string[] {
  const out: string[] = [];
  const n = 2 + (rnd() < 0.5 ? 1 : 0);
  for (let t = 0; t < 12 && out.length < n; t++) {
    const x = pick(rnd, TRAITS);
    if (x === 'Mad' && rnd() < 0.8) continue;
    if (out.includes(x) || out.includes(OPPOSED[x])) continue;
    out.push(x);
  }
  return out;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];
export const roman = (n: number) => ROMAN[n] ?? String(n);

/** Court offices by culture: [chancellor, marshal, steward, spymaster, priest]. */
export const COURT: Record<string, string[]> = {
  anglo: ['Chancellor', 'Lord Marshal', 'Lord Steward', 'Master of Whispers', 'Archbishop'],
  latin: ['Chancellor', 'Constable', 'Chamberlain', 'Master of Secrets', 'Cardinal'],
  norse: ['Lawspeaker', 'Marshal', 'Steward', 'Skald', 'Godi'], 
  celtic: ['Brehon', 'Champion', 'Steward', 'Ollam', 'Archdruid'],
  elvish: ['High Counsellor', 'Warden of the Bows', 'Keeper of the Halls', 'Master of Shadows', 'Star-reader'],
  desert: ['Grand Vizier', 'Pasha of the Army', 'Defterdar', 'Master of Eyes', 'Grand Mufti'],
  slavic: ['Chancellor', 'Voivode of the Host', 'Treasurer', 'Master of Secrets', 'Metropolitan'],
  dwarven: ['Loremaster', 'Marshal of the Halls', 'Hoardwarden', 'Tunnelwatcher', 'Forgepriest'],
  southern: ['Logothete', 'Domestic of the Schools', 'Sakellarios', 'Master of Offices', 'Patriarch'],
  steppe: ['Chief Scribe', 'Noyan', 'Treasurer', 'Master', 'Shaman'],
  jungle: ['Speaker', 'Jaguar Captain', 'Tribute Master', 'Night Watcher', 'High Priest'],
  sinic: ['Chancellor', 'Grand Marshal', 'Minister of Revenue', 'Eunuch of the Eastern Depot', 'Grand Astrologer'],
  japonic: ['Regent', 'Constable', 'Commissioner of Finance', 'Master of the Night', 'Abbot of the Great Temple'],
  koreanic: ['Chief State Councillor', 'Commander of the Army', 'Minister of Taxation', 'Royal Inspector', 'Royal Shaman'],
  woodland: ['Speaker', 'War Chief', 'Keeper of the Stores', 'Scout', 'Medicine Keeper'],
  highland: ['Council Elder', 'Apu of the Armies', 'Keeper of the Quipu', 'Runner Chief', 'High Priest'],
};
