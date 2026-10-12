/**
 * The core vocabulary every language has a word for, by English gloss: the dictionary in the
 * culture window lists it, and names and translations draw on it. Any other English word also
 * gets a word on demand (made the same way), so the lexicon never runs out.
 */
export type POS = 'n' | 'adj' | 'v' | 'num' | 'pron' | 'adv' | 'part';
export interface Concept {
  en: string;
  pos: POS;
  cat: string;
  /** Short, common words get shorter forms. */
  short?: boolean;
}

const L = (cat: string, pos: POS, words: string, short = false): Concept[] => words.split(',').map((w) => ({ en: w.trim(), pos, cat, short }));

export const LEXICON: Concept[] = [
  ...L('Land', 'n', 'land,earth,mountain,hill,valley,plain,field,meadow,forest,wood,grove,tree,stone,rock,cave,desert,sand,marsh,island,cape,cliff,shore,beach,pass,ridge,peak,moor,heath,dust,mud,clay'),
  ...L('Water', 'n', 'water,river,stream,brook,spring,well,lake,pool,sea,ocean,bay,wave,ford,waterfall,ice,snow,rain,mist,flood,tide'),
  ...L('Sky', 'n', 'sky,sun,moon,star,cloud,wind,storm,thunder,lightning,light,darkness,shadow,fire,smoke,day,night,dawn,dusk,winter,summer,season,autumn,year'),
  ...L('Places', 'n', 'town,city,village,farm,house,home,hall,tower,wall,gate,bridge,road,path,fort,castle,temple,shrine,market,harbour,ship,boat,mill,grave,tomb,throne,crown,camp'),
  ...L('Plants', 'n', 'oak,ash,pine,birch,willow,yew,thorn,rose,flower,grass,reed,leaf,root,seed,fruit,apple,grain,bread,wine,honey,salt'),
  ...L('Animals', 'n', 'animal,horse,cow,sheep,goat,pig,dog,cat,wolf,bear,fox,deer,stag,boar,hare,bird,eagle,hawk,raven,crow,owl,swan,fish,snake,serpent,dragon,lion,bee,whale'),
  ...L('Body', 'n', 'head,eye,ear,mouth,tooth,tongue,hand,arm,foot,leg,heart,blood,bone,skin,hair,face,breath'),
  ...L('People', 'n', 'person,man,woman,child,boy,girl,father,mother,son,daughter,brother,sister,friend,enemy,king,queen,lord,lady,prince,priest,warrior,smith,farmer,hunter,merchant,slave,stranger,people,clan,tribe,god,spirit,ghost,giant'),
  ...L('Things', 'n', 'sword,axe,spear,bow,arrow,shield,helm,hammer,knife,gold,silver,iron,copper,jewel,coin,ring,cup,bowl,cloth,rope,book,word,name,song,law,war,peace,death,life,love,fear,hope,dream,truth,glory,honour,blessing,curse,gift'),
  ...L('Qualities', 'adj', 'big,great,small,little,long,short,high,low,deep,wide,narrow,old,young,new,ancient,good,bad,beautiful,ugly,holy,cursed,strong,weak,fast,slow,hot,cold,warm,wet,dry,dark,bright,hidden,lost,wild,quiet,proud,wise,brave,cruel,rich,poor,sweet,bitter,green,red,white,black,grey,blue,yellow,golden,silver,iron,stone,first,last,many,few'),
  ...L('Directions', 'n', 'north,south,east,west,middle,edge,side,top,bottom'),
  ...L('Actions', 'v', 'be,have,go,come,see,hear,speak,say,know,think,give,take,make,build,eat,drink,sleep,die,kill,fight,rule,love,hate,sing,dance,walk,run,ride,swim,fly,fall,stand,sit,live,grow,burn,find,lose,hold,open,close,pray,trade,sail,hunt,remember,forget'),
  ...L('Numbers', 'num', 'one,two,three,four,five,six,seven,eight,nine,ten,hundred,thousand', true),
  ...L('Grammar', 'adv', 'here,there,now,then,always,never,again,very,not,yes,no', true),
];
export const LEX = new Map(LEXICON.map((c) => [c.en, c]));

/** Personal pronouns, in table order. */
export const PRONOUNS = ['I', 'you', 'he', 'she', 'it', 'we', 'you (plural)', 'they'] as const;
